# SDK Consumer Test

Role:
You are testing whether the SDK can be used from a separate app.

Goal:
A developer should be able to import the SDK outside the monorepo.

Tasks:
1. Create a temporary app outside this repo:
   ../tokenisation-sdk-consumer-test

2. Initialize a minimal TypeScript app.

3. Link or install the local SDK package.

4. Import the SDK.

5. Create an asset.

6. Create a token.

7. Run the script.

Create:
- loop/reports/sdk_consumer_test.md
- examples/minimal-sdk-consumer/README.md
- examples/minimal-sdk-consumer/src/index.ts

Check:
- package exports
- TypeScript types
- build output
- ESM/CJS compatibility
- documented import path
- whether README examples match real SDK code

Update:
- loop/fix_queue.md
- loop/loop_state.json

When done:
Set sdk_consumer_test to completed or blocked.
Set current_stage to loyalty_demo_test.
