from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework.exceptions import ValidationError

from apps.audit.services import record_audit
from apps.accounting.models import PurchaseInvoice
from apps.purchasing.models import PurchaseOrderItem


@transaction.atomic
def record_invoice_payment(invoice_id: int, user, amount: Decimal) -> PurchaseInvoice:
    invoice = PurchaseInvoice.objects.select_for_update().get(pk=invoice_id)
    if amount <= 0:
        raise ValidationError({'amount': 'Payment amount must be greater than zero.'})
    if amount > invoice.outstanding_amount:
        raise ValidationError({'amount': 'Payment cannot exceed the outstanding amount.'})
    previous = invoice.paid_amount
    invoice.paid_amount += amount
    invoice.outstanding_amount = invoice.grand_total - invoice.paid_amount
    invoice.status = (
        PurchaseInvoice.Status.PAID
        if invoice.outstanding_amount == 0
        else PurchaseInvoice.Status.PARTIALLY_PAID
    )
    invoice.save(update_fields=('paid_amount', 'outstanding_amount', 'status', 'updated_at'))
    record_audit(user, 'PAYMENT', invoice, old_data={'paid_amount': previous}, new_data={
        'paid_amount': invoice.paid_amount,
        'outstanding_amount': invoice.outstanding_amount,
        'payment': amount,
    })
    return invoice


def three_way_match(invoice: PurchaseInvoice) -> dict:
    purchase_order = invoice.purchase_order
    po_lines = list(purchase_order.items.select_related('item'))
    receipt_totals = {}
    for row in purchase_order.receipts.filter(status='SUBMITTED').values(
        'items__purchase_order_item__item_id'
    ).annotate(
        received=Sum('items__received_quantity'),
        rejected=Sum('items__rejected_quantity'),
    ):
        item_id = row['items__purchase_order_item__item_id']
        receipt_totals[item_id] = row['received'] - row['rejected']

    invoice_lines = list(invoice.items.select_related('item'))
    po_by_item = {line.item_id: line for line in po_lines}
    invoice_by_item = {}
    for line in invoice_lines:
        bucket = invoice_by_item.setdefault(line.item_id, {
            'item_code': line.item.item_code,
            'quantity': Decimal('0'),
            'amount': Decimal('0'),
            'rates': set(),
        })
        bucket['quantity'] += line.quantity
        bucket['amount'] += line.amount
        bucket['rates'].add(line.rate)

    po_item_ids = set(po_by_item)
    invoice_item_ids = set(invoice_by_item)
    mismatch = 'MATCHED'
    if po_item_ids != invoice_item_ids:
        mismatch = 'ITEM_MISMATCH'
    else:
        quantity_mismatch = any(
            invoice_by_item[item_id]['quantity'] != receipt_totals.get(item_id, Decimal('0'))
            for item_id in po_item_ids
        )
        if quantity_mismatch:
            mismatch = 'QUANTITY_MISMATCH'
        elif any(
            invoice_by_item[item_id]['rates'] != {po_by_item[item_id].rate}
            for item_id in po_item_ids
        ):
            mismatch = 'RATE_MISMATCH'
        else:
            expected_total = Decimal('0')
            for item_id, po_line in po_by_item.items():
                received = receipt_totals.get(item_id, Decimal('0'))
                discount_share = po_line.discount * received / po_line.quantity
                net = received * po_line.rate - discount_share
                expected_total += net + net * po_line.tax_rate / 100
            invoice_lines_total = sum((row['amount'] for row in invoice_by_item.values()), Decimal('0'))
            if (invoice_lines_total - expected_total).copy_abs() >= Decimal('0.01'):
                mismatch = 'TOTAL_MISMATCH'

    details = []
    for item_id in sorted(po_item_ids | invoice_item_ids):
        po_line = po_by_item.get(item_id)
        details.append({
            'item_id': item_id,
            'item_code': po_line.item.item_code if po_line else invoice_by_item[item_id]['item_code'],
            'purchase_order_quantity': po_line.quantity if po_line else None,
            'received_quantity': receipt_totals.get(item_id, Decimal('0')),
            'invoice_quantity': invoice_by_item.get(item_id, {}).get('quantity', Decimal('0')),
            'purchase_order_rate': po_line.rate if po_line else None,
            'invoice_rates': sorted(invoice_by_item.get(item_id, {}).get('rates', set())),
        })
    return {
        'invoice_id': invoice.id,
        'invoice_number': invoice.invoice_number,
        'result': mismatch,
        'purchase_order': purchase_order.po_number,
        'details': details,
    }


@transaction.atomic
def process_three_way_match(invoice_id: int, user):
    invoice = PurchaseInvoice.objects.select_for_update().select_related('purchase_order').get(pk=invoice_id)
    result = three_way_match(invoice)
    old_status = invoice.status
    invoice.status = (
        PurchaseInvoice.Status.MATCHED
        if result['result'] == 'MATCHED'
        else PurchaseInvoice.Status.DISPUTED
    )
    invoice.save(update_fields=('status', 'updated_at'))
    record_audit(user, 'UPDATE', invoice, old_data={'status': old_status}, new_data={
        'status': invoice.status,
        'match_result': result['result'],
    })
    return invoice, result