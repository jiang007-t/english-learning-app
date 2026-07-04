"""
scf_bootstrap.py — Tencent Cloud SCF (Serverless Cloud Function) entry point.
Connect this function to an API Gateway trigger.

Deployment:
1. Zip ALL files in this directory into a package.zip
2. Upload to Tencent Cloud SCF → Create function → Python 3.13+
3. Set Handler to: scf_bootstrap.main_handler
4. Create API Gateway trigger (ANY method, ANY path)
5. Environment variables (optional):
   - DEEPSEEK_API_KEY: Your DeepSeek API key (overrides config.py)
   - ADMIN_PASSWORD: Admin panel password
"""

import sys
import os
import json
import traceback

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Override config from environment variables if set
try:
    from config import DEEPSEEK_API_KEY, API_BASE_URL, MODEL_NAME
except ImportError:
    DEEPSEEK_API_KEY = ""
    API_BASE_URL = "https://api.deepseek.com/v1"
    MODEL_NAME = "deepseek-chat"

if os.environ.get('DEEPSEEK_API_KEY'):
    import config
    config.DEEPSEEK_API_KEY = os.environ['DEEPSEEK_API_KEY']
if os.environ.get('ADMIN_PASSWORD'):
    import server
    server.ADMIN_PASSWORD = os.environ['ADMIN_PASSWORD']

from server import app


def main_handler(event, context):
    """
    SCF entry point for API Gateway trigger.
    event: API Gateway request event
    context: SCF runtime context
    """
    from werkzeug.serving import run_simple
    from werkzeug.testapp import test_app
    from io import BytesIO
    from urllib.parse import urlparse, parse_qs

    try:
        # Parse API Gateway event
        http_method = event.get('httpMethod', event.get('requestContext', {}).get('httpMethod', 'GET'))
        path = event.get('path', event.get('requestContext', {}).get('path', '/'))
        headers = event.get('headers', {})
        query_params = event.get('queryString', event.get('queryStringParameters', {})) or {}
        body = event.get('body', '')

        # Build WSGI environ
        from flask import Request
        from werkzeug.urls import url_encode

        # Convert to Flask test client request
        with app.test_client() as client:
            if http_method == 'GET':
                resp = client.get(path, query_string=query_params, headers=headers)
            elif http_method == 'POST':
                content_type = headers.get('Content-Type', 'application/json')
                resp = client.post(path, data=body, content_type=content_type,
                                   query_string=query_params, headers=headers)
            elif http_method == 'PUT':
                content_type = headers.get('Content-Type', 'application/json')
                resp = client.put(path, data=body, content_type=content_type,
                                  query_string=query_params, headers=headers)
            elif http_method == 'DELETE':
                resp = client.delete(path, query_string=query_params, headers=headers)
            else:
                resp = client.open(path, method=http_method, data=body, headers=headers)

            # Build API Gateway response
            return {
                'isBase64Encoded': False,
                'statusCode': resp.status_code,
                'headers': dict(resp.headers),
                'body': resp.get_data(as_text=True),
            }

    except Exception as e:
        traceback.print_exc()
        return {
            'isBase64Encoded': False,
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': str(e)}),
        }
