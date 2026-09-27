from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import record_audit
from apps.inventory.models import StockMovement
from apps.procurement.models import Item
from apps.purchasing.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseReceipt,
    PurchaseReceiptItem,
)


def calculate_purchase_order(order: PurchaseOrder) -> None:
    subtotal = Decimal('0')
    discount_total = Decimal('0')
    tax_total = Decimal('0')
    for line in order.items.all():
        line_subtotal = line.quantity * line.rate
        if line.discount > line_subtotal:
            raise ValidationError({'items': f'Discount exceeds line value for {line.item.item_code}.'})
        taxable = line_subtotal - line.discount
        line.amount = taxable + (taxable * line.tax_rate / 100)
        line.save(update_fields=('amount',))
        subtotal += line_subtotal
        discount_total += line.discount
        tax_total += taxable * line.tax_rate / 100
    order.subtotal = subtotal.quantize(Decimal('0.01'))
    order.discount_amount = discount_total.quantize(Decimal('0.01'))
    order.tax_amount = tax_total.quantize(Decimal('0.01'))
    order.grand_total = (order.subtotal - order.discount_amount + order.tax_amount).quantize(Decimal('0.01'))
    order.save(update_fields=('subtotal', 'discount_amount', 'tax_amount', 'grand_total', 'updated_at'))


@transaction.atomic
def approve_purchase_order(order_id: int, user) -> PurchaseOrder:
    order = PurchaseOrder.objects.select_for_update().get(pk=order_id)
    if order.status != PurchaseOrder.Status.PENDING_APPROVAL:
        raise ValidationError({'status': 'Only pending purchase orders can be approved.'})
    if order.created_by_id == user.id:
        raise ValidationError({'approval': 'You cannot approve a purchase order you created.'})
    old = {'status': order.status}
    order.status = PurchaseOrder.Status.APPROVED
    order.approved_by = user
    order.approved_at = timezone.now()
    order.rejected_by = None
    order.rejected_at = None
    order.rejection_reason = ''
    order.save(update_fields=('status', 'approved_by', 'approved_at', 'rejected_by', 'rejected_at', 'rejection_reason', 'updated_at'))
    record_audit(user, 'APPROVE', order, old_data=old, new_data={'status': order.status, 'approved_by': user.username})
    return order


@transaction.atomic
def reject_purchase_order(order_id: int, user, reason: str) -> PurchaseOrder:
    reason = reason.strip()
    if not reason:
        raise ValidationError({'reason': 'A rejection reason is required.'})
    order = PurchaseOrder.objects.select_for_update().get(pk=order_id)
    if order.status != PurchaseOrder.Status.PENDING_APPROVAL:
        raise ValidationError({'status': 'Only pending purchase orders can be rejected.'})
    old = {'status': order.status}
    order.status = PurchaseOrder.Status.REJECTED
    order.rejected_by = user
    order.rejected_at = timezone.now()
    order.rejection_reason = reason
    order.save(update_fields=('status', 'rejected_by', 'rejected_at', 'rejection_reason', 'updated_at'))
    record_audit(user, 'REJECT', order, old_data=old, new_data={'status': order.status, 'reason': reason})
    return order


@transaction.atomic
def create_purchase_receipt(*, data: dict, user) -> PurchaseReceipt:
    order = PurchaseOrder.objects.select_for_update().get(pk=data['purchase_order'].pk)
    if order.status not in (PurchaseOrder.Status.APPROVED, PurchaseOrder.Status.ORDERED, PurchaseOrder.Status.PARTIALLY_RECEIVED):
        raise ValidationError({'purchase_order': 'Only approved or ordered purchase orders can be received.'})

    receipt_items = data.pop('items')
    receipt = PurchaseReceipt.objects.create(received_by=user, **data)
    movement_count = 0
    for line_data in receipt_items:
        po_line = PurchaseOrderItem.objects.select_for_update().get(pk=line_data['purchase_order_item'].pk)
        if po_line.purchase_order_id != order.id:
            raise ValidationError({'items': 'Every receipt line must belong to the selected purchase order.'})
        remaining = po_line.quantity - po_line.received_quantity
        received = line_data['received_quantity']
        rejected = line_data.get('rejected_quantity', Decimal('0'))
        if received > remaining:
            raise ValidationError({
                'items': f'Receipt quantity {received} exceeds remaining quantity {remaining} for {po_line.item.item_code}.'
            })
        if rejected > received:
            raise ValidationError({'items': 'Rejected quantity cannot exceed received quantity.'})
        accepted = received - rejected
        receipt_line = PurchaseReceiptItem.objects.create(
            receipt=receipt,
            purchase_order_item=po_line,
            ordered_quantity=po_line.quantity,
            received_quantity=received,
            rejected_quantity=rejected,
        )
        if accepted > 0:
            po_line.received_quantity += accepted
            po_line.save(update_fields=('received_quantity',))
            item = Item.objects.select_for_update().get(pk=po_line.item_id)
            item.current_stock += accepted
            item.save(update_fields=('current_stock', 'updated_at'))
            warehouse_balance = StockMovement.objects.filter(
                item=item, warehouse=receipt.warehouse
            ).order_by('-id').values_list('balance_quantity', flat=True).first() or Decimal('0')
            StockMovement.objects.create(
                item=item,
                warehouse=receipt.warehouse,
                transaction_type=StockMovement.TransactionType.PURCHASE_RECEIPT,
                reference_type='PurchaseReceipt',
                reference_id=str(receipt.pk),
                quantity=accepted,
                balance_quantity=warehouse_balance + accepted,
                transaction_date=timezone.now(),
                created_by=user,
            )
            movement_count += 1
        if receipt_line.accepted_quantity < 0:
            raise ValidationError({'items': 'Accepted quantity cannot be negative.'})

    if movement_count == 0:
        raise ValidationError({'items': 'At least one accepted item is required to record a stock movement.'})

    remaining_count = order.items.filter(received_quantity__lt=F('quantity')).exists()
    order.status = PurchaseOrder.Status.PARTIALLY_RECEIVED if remaining_count else PurchaseOrder.Status.RECEIVED
    order.save(update_fields=('status', 'updated_at'))
    receipt.status = PurchaseReceipt.Status.SUBMITTED
    receipt.save(update_fields=('status',))
    record_audit(user, 'RECEIPT', receipt, new_data={
        'purchase_order': order.po_number,
        'warehouse': receipt.warehouse.code,
        'stock_movements': movement_count,
    })
    return receipt