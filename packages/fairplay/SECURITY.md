# Security

fairplay generates and checks puzzles. It does no networking, reads no files at run time, and runs Z3 as WebAssembly.

The one thing worth protecting is **the solution**. If you find a way for `publicView`, `sliceFor` (for an innocent suspect), `objectionSlip`, or any clue text to leak the culprit or the means before the reveal, please treat it as a security issue.

**To report:** open a private security advisory on GitHub (Security tab, "Report a vulnerability"), or email the maintainer. Please do not open a public issue for leaks. You should hear back within a week.

Supported versions: the latest minor release.
