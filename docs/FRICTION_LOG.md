# Accomplice friction log: Vega OS SDK 0.24, Alexa+ add-on docs, Amazon Polly / Transcribe / Translate, AWS account setup

| Reviewer | Status |
| :--- | :--- |
| **Dhiraj Kavuri** | Complete |
| **Fire TV, Alexa+ and AWS teams** | Under review |

## BLUF (bottom line up front)

Building a Fire TV party game on Vega OS was fast once the SDK was installed: a WebView app built for three architectures on the first try and ran on the Vega Virtual Device the same evening. The two things that cost the most time were outside the code. The Vega Virtual Device kept going offline a few minutes after it reported "ready", and a new AWS India (AISPL) account was blocked from every Amazon Bedrock model with an error that never said why. Amazon Polly and Transcribe were the stars of the build.

**Grade:** B

## Persona

- **Role:** Solo developer, student, India
- **Experience with these products:** First time with Vega OS, Alexa+ add-ons and Polly speech marks; some prior AWS use
- **Goal:** Ship a voice-driven multiplayer party game for Fire TV, with an Alexa+ MCP add-on, deployed on AWS
- **Technical context:** macOS 26 on Apple Silicon, Node 26, fresh Vega SDK install, new AWS account

## Scope

- [x] Install the Vega SDK and CLI
- [x] Generate, build and run a Vega app on the Vega Virtual Device
- [x] Read the Alexa+ MCP toolkit, client lifecycle and design guide docs, then build a self-hosted MCP server (spec 2025-11-25, Streamable HTTP)
- [x] Use Amazon Polly (neural and generative) with speech marks for word-synced captions
- [x] Use Amazon Transcribe streaming for players' spoken questions
- [x] Use Amazon Translate for players who prefer Hindi
- [x] Call Amazon Bedrock from a new AWS India account
- [x] Deploy with AWS CDK (ECS Fargate, ALB, CloudFront, S3, DynamoDB, Secrets Manager)

## Pros

- The Vega SDK installer is one command and set itself up cleanly, including the Vega Virtual Device.
- `vega project list-templates` and the `vegaWebview` template got a working app shell in minutes, and `npm run build:debug` produced armv7, aarch64 and x86_64 packages on the first run.
- The "supported libraries" page for Vega is clear about which React Native packages are ported, which saved guesswork.
- The Alexa+ MCP add-on design guide is genuinely useful. "One title, one or two fields, one action" and the far-field type advice shaped our Echo screens.
- Polly speech marks are excellent: word timings let us light up captions word by word in sync with each suspect's voice.
- Transcribe streaming returned final transcripts about 0.63 s after a player stopped talking.
- Translate worked first time for English to Hindi.
- The AWS Free Tier credit activities are a nice nudge; the EC2, Budgets and RDS credits registered even when done from the CLI, just with a delay.

## Cons

- The Vega Virtual Device does not stay connected, and there is no clear message explaining why.
- The project generator writes files into the output directory itself rather than into a folder named after the project.
- There is no documented way to take a screenshot of the Vega Virtual Device from the CLI, and the on-device tool fails.
- On a new AWS India (AISPL) account every Bedrock model is blocked, and the errors don't point to the account type.
- The Alexa+ client lifecycle page and the toolkit overview disagree about the MCP protocol version.
- Polly generative voices are only in us-east-1, so from India they add about 1.4 s per line compared with neural voices in ap-south-1.

## Friction

### The Vega Virtual Device goes offline after reporting ready

**Severity:** High

**Expected:** After `vega virtual-device start` prints "Virtual device ready.", the device stays available to `vega run-app` until it is stopped.

**Actual:** A few minutes later `vega virtual-device status` returned `{"running":false,"process_ids":{"qemu":-1}}` and `vega run-app` failed with "Couldn't find device '': Device not found: No connected Vega devices found". After a restart, the first `run-app` failed with "Incomplete: vda: device offline", and a retry about 20 s later worked. This happened three times in one evening. The error log for the day was empty.

**Workaround:** Start the device with `nohup vega virtual-device start --timeout 180`, wait for `vega device list` to show it, then retry `run-app`.

**Recommendation:** Keep the device process alive independently of the starting shell, write the reason for shutdown to the error log, and have `run-app` wait for the device to come online instead of failing.

### `vega project generate` writes into the output directory, not a project folder

**Severity:** Medium

**Expected:** `vega project generate -t vegaWebview -n accomplice -o apps` creates `apps/accomplice/`.

**Actual:** The template files (package.json, manifest.toml, src, assets and so on) were written straight into `apps/`, next to our other apps.

**Workaround:** Moved the files into a subfolder by hand.

**Recommendation:** Create a folder named after the project inside the output directory, or say clearly in `--help` that the output directory is the project root.

### No working way to screenshot the Vega Virtual Device from the CLI

**Severity:** Medium

**Expected:** A documented command to capture the virtual device's screen for testing and for store listings.

**Actual:** The device image ships `screenshooter`, but `vda shell 'screenshooter /tmp/s.png'` failed with "creating a buffer file for 8294400 B failed: Permission denied" and "error marshalling arguments for shoot". There is no `vega device screenshot` command.

**Recommendation:** Add `vega device screenshot <file>` that works on both the virtual device and Fire TV sticks.

### Reaching a development server on the host from the Vega Virtual Device is not documented

**Severity:** Medium

**Expected:** A documented host alias (like 10.0.2.2 on the Android emulator) or port forwarding for local servers.

**Actual:** We found nothing in the docs, so our WebView app now points at a public HTTPS address instead of the laptop.

**Recommendation:** Document the virtual device's networking and add a `vega device reverse` style command.

### The Vega WebView blocks plain HTTP, and the setting that allows it isn't documented

**Severity:** Medium

**Expected:** A WebView pointed at an `http://` URL either loads it or logs why it refused.

**Actual:** The app showed our offline page, while `curl` from the device shell reached the same URL with a 200. We found the fix, a `[network-traffic-policy.cleartext]` section with `allowed-domains` in `manifest.toml`, by reading key names inside the device's package-manager library. We couldn't find it in the public docs.

**Recommendation:** Document the network traffic policy in the manifest reference and log a clear message when the WebView blocks cleartext traffic.

### `vega build -b Release` produces a package with no JavaScript

**Severity:** Medium

**Expected:** A release build that runs.

**Actual:** `vega build -b Release` skipped the JavaScript bundle and produced a 5 KB package that couldn't start. `npm run build:release` from the template works.

**Recommendation:** Have the CLI build the bundle too, or fail with a message pointing at the npm script.

### Bedrock is blocked on a new AWS India (AISPL) account with no explanation

**Severity:** Critical

**Expected:** With an IAM user that has AdministratorAccess in us-east-1, a call to `bedrock-runtime converse` for Amazon Nova Lite returns a reply, or the error says what is blocking it.

**Actual:** First "AccessDeniedException ... Your account is currently being verified", then for hours "ValidationException: Operation not allowed" on every model. `get-foundation-model-availability` reports `authorizationStatus: NOT_AUTHORIZED` while `iam simulate-principal-policy` allows `bedrock:InvokeModel`. In the console Workbench, every model (Anthropic and OpenAI) returned "not available for this account". Other developers on re:Post report the same pattern on AISPL accounts.

**Workaround:** We built the game without Bedrock: Polly, Transcribe and Translate for voice, and a model API outside AWS for suspect dialogue.

**Recommendation:** If AISPL accounts can't use Bedrock models, say so in the error ("Bedrock model access is not available for AWS India accounts") and in the Bedrock docs, and offer a path to request access.

### The Alexa+ docs disagree about the MCP protocol version

**Severity:** Medium

**Expected:** One protocol version across the add-on docs.

**Actual:** The toolkit overview says Alexa+ supports MCP spec 2025-11-25, while the client lifecycle page's sample `initialize` request shows `"protocolVersion": "2025-03-26"` and declares only the `roots` capability.

**Recommendation:** Update the lifecycle example to 2025-11-25 and list which client capabilities Alexa+ declares (elicitation, MCP Apps, sampling or not).

### Alexa+ "Supported capabilities" lists no limits

**Severity:** Low

**Expected:** Timeouts, maximum tool count, payload size limits and MCP Apps sandbox rules in one place.

**Actual:** The page is an index of authentication and account linking. We could not find limits anywhere public.

**Recommendation:** Add a limits table so developers can design within them before they get toolkit access.

### Polly generative voices only in us-east-1

**Severity:** Low

**Expected:** The most natural voices available in the Mumbai region for players in India.

**Actual:** Generative voices are us-east-1 only. Neural voices from ap-south-1 returned in about 0.6 s; generative from us-east-1 took about 2 s per line. For a live game, that difference is the gap between a snappy suspect and an awkward pause.

**Workaround:** Neural voices for live suspect answers, generative for narration recorded ahead of time.

**Recommendation:** Bring generative voices to ap-south-1.

### CloudFront refuses new distributions until the account is verified

**Severity:** High

**Expected:** `cdk deploy` of a stack containing an `AWS::CloudFront::Distribution` succeeds on a new account that already has working credits, a budget and running services in other regions.

**Actual:** The distribution failed with "Access denied for operation 'AWS::CloudFront::Distribution': Your account must be verified before you can add new CloudFront resources. To verify your account, please contact AWS Support." The stack rolled back to `ROLLBACK_FAILED` because the S3 bucket it had created was no longer empty. Nothing in the CloudFront console, the Free Tier credit page or `cdk diff` warned about this beforehand.

**Workaround:** Emptied the bucket and deleted the stack, then made CloudFront optional behind one CDK context flag. Without it, the Fargate service sits behind the load balancer and phones get HTTPS from a tunnel started inside the container.

**Recommendation:** Show the verification requirement before a deploy fails (for example in `cdk diff`, the CloudFront console banner, or an IAM-style "pre-check"), and let a stack fail without leaving `ROLLBACK_FAILED` behind because of a bucket it created itself.

### App Runner can't serve WebSockets

**Severity:** Low

**Expected:** The simplest container service to be the right choice for a small real-time game server.

**Actual:** App Runner doesn't support WebSockets, so we moved to ECS Fargate behind an Application Load Balancer and CloudFront, which adds about $18 a month for the load balancer alone.

**Recommendation:** WebSocket support in App Runner would make it the obvious choice for hackathon-scale real-time apps.

## Questions

- How does the Vega Virtual Device reach services on the host machine?
- Can a third-party Vega app use a microphone or camera (for example, the Fire TV remote's mic) through any public API?
- Which MCP client capabilities does Alexa+ declare today, and what are the tool-call timeout and response size limits?
- Is Bedrock model access possible at all for AISPL accounts, and if so, how?

## Recommendations

1. Make the Vega Virtual Device stay online and explain shutdowns in the error log.
2. Fix the Bedrock error on AISPL accounts so it names the real cause.
3. Align the Alexa+ protocol version across pages and publish limits.
4. Add `vega device screenshot` and document host networking for the virtual device.
5. Warn about CloudFront account verification before a deploy, not during it.
6. Create a project folder in `vega project generate`.
7. Bring Polly generative voices to ap-south-1.

## Test environment

- OS: macOS 26.6.2 on Apple Silicon
- Device/Emulator: Vega Virtual Device (aarch64), Vega SDK 0.24.12112, Vega CLI 1.4.7
- Phones: iPhone (Safari) and Android (Chrome)
- Runtime: Node 26.12, pnpm 11.25, AWS CLI 2.36, AWS CDK
- AWS: new account billed by Amazon Web Services India Private Limited, regions us-east-1 and ap-south-1

## What succeeded

- Vega SDK install, project generation, build for three architectures, install and launch on the virtual device
- Polly neural and generative voices with word speech marks
- Transcribe streaming from phone browsers
- Translate English to Hindi
- CDK bootstrap and synth of the full stack

## What failed

- Keeping the Vega Virtual Device connected without restarts
- Screenshots from the Vega Virtual Device
- Any Amazon Bedrock model call on an AISPL account
- Creating a CloudFront distribution before account verification (first deploy rolled back)
