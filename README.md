# rel=me verifier

This is a userscript that automatically validates the cyclical linkage of
[rel=me](https://indieweb.org/rel-me) links on the pages you visit. It happens
entirely from your browser, no third party server is needed. The script will
request permission to access the entire internet the first time it tries to
verify a link (tested in Tampermonkey for Chrome).

The script tries very hard to not interfere with the layout of the page, by
making the verification markers float at the top left of the links. This may
not always be 100% successful.

Inspired by [indieweb/verify-me](https://github.com/indieweb/verify-me).
