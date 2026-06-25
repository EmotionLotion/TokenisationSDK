# API Server Test

Role:
You are testing whether the backend works for a new developer.

Read:
- README.md
- server/
- server/.env.example
- loop/loop_state.json
- loop/reports/install_test.md

Tasks:
1. Copy server/.env.example to server/.env.
2. Start the API server.
3. Find the health endpoint.
4. Create an asset using the documented API.
5. Create a token if endpoint exists.
6. Compare documented routes with actual routes.

Create:
- loop/reports/api_server_test.md
- loop/reports/api_endpoint_matrix.md

Record:
- command used to start server
- working endpoints
- broken endpoints
- missing docs
- required environment variables
- example curl commands

Update:
- loop/fix_queue.md
- loop/loop_state.json

When done:
Set api_server_test to completed or blocked.
Set current_stage to sdk_consumer_test.
