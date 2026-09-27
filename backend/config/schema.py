from drf_spectacular.openapi import AutoSchema


class EnvelopeAutoSchema(AutoSchema):
    def get_operation(self, path, path_regex, path_prefix, method, registry):
        operation = super().get_operation(path, path_regex, path_prefix, method, registry)
        if not operation:
            return operation

        error_schema = {
            'type': 'object',
            'properties': {
                'success': {'type': 'boolean', 'enum': [False]},
                'message': {'type': 'string'},
                'errors': {'type': 'object', 'additionalProperties': True},
            },
            'required': ['success', 'message', 'errors'],
        }
        common_errors = {
            '400': 'Validation error',
            '401': 'Authentication required',
            '403': 'Permission denied',
            '404': 'Resource not found',
            '500': 'Unexpected server error',
        }
        responses = operation.setdefault('responses', {})
        for code, description in common_errors.items():
            responses.setdefault(code, {
                'description': description,
                'content': {'application/json': {'schema': error_schema}},
            })
        return operation

    def _get_response_for_code(self, serializer, status_code, media_types=None, direction='response'):
        response = super()._get_response_for_code(serializer, status_code, media_types, direction)
        try:
            response_status = int(status_code)
        except (TypeError, ValueError):
            return response

        if response_status == 204 or 'content' not in response:
            return response

        for media_object in response['content'].values():
            data_schema = media_object.get('schema', {'type': 'object'})
            if response_status < 400:
                properties = {
                    'success': {'type': 'boolean', 'enum': [True]},
                    'message': {'type': 'string'},
                    'data': data_schema,
                }
                required = ['success', 'message', 'data']
            else:
                properties = {
                    'success': {'type': 'boolean', 'enum': [False]},
                    'message': {'type': 'string'},
                    'errors': data_schema,
                }
                required = ['success', 'message', 'errors']
            media_object['schema'] = {
                'type': 'object',
                'properties': properties,
                'required': required,
            }
        return response