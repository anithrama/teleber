import logging

from rest_framework import status
from rest_framework.exceptions import ErrorDetail
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def _message(response_status: int) -> str:
    if response_status == status.HTTP_201_CREATED:
        return 'Created successfully.'
    if response_status == status.HTTP_204_NO_CONTENT:
        return 'Deleted successfully.'
    if response_status >= status.HTTP_500_INTERNAL_SERVER_ERROR:
        return 'The server could not complete the request.'
    if response_status >= status.HTTP_400_BAD_REQUEST:
        return 'The request could not be completed.'
    return 'Request completed successfully.'


def api_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        logger.exception('Unhandled API exception', exc_info=(type(exc), exc, exc.__traceback__))
        return Response(
            {
                'success': False,
                'message': 'The server could not complete the request.',
                'errors': {'detail': 'An unexpected error occurred.'},
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    original_data = response.data
    message = original_data.get('detail') if isinstance(original_data, dict) else None
    response.data = {
        'success': False,
        'message': str(message) if isinstance(message, (str, ErrorDetail)) else _message(response.status_code),
        'errors': original_data,
    }
    return response


class APIEnvelopeJSONRenderer(JSONRenderer):
    def render(self, data, accepted_media_type=None, renderer_context=None):
        renderer_context = renderer_context or {}
        response = renderer_context.get('response')
        request = renderer_context.get('request')
        if response is None or (request and request.path.startswith('/api/schema/')):
            return super().render(data, accepted_media_type, renderer_context)

        if isinstance(data, dict) and {'success', 'message', 'data'} <= data.keys():
            envelope = data
        elif response.status_code >= status.HTTP_400_BAD_REQUEST:
            envelope = data
        else:
            message = response.status_text if response.status_code >= 300 else _message(response.status_code)
            envelope = {'success': True, 'message': message, 'data': data}
        return super().render(envelope, accepted_media_type, renderer_context)