// ==UserScript==
// @name         rel=me verifier
// @namespace    lv.vil.relme
// @version      1.0
// @description  Detects all rel=me links on the current page and verifies the existence of a cyclical linkage. Adds a visual marker to indicate the result of the verification.
// @author       vilhalmer <vil@vil.lv>
// @grant        GM_xmlhttpRequest
// @connect      *
// @match        *://*/*
// ==/UserScript==

(function () {
    const VALID = 'valid';
    const INVALID = 'invalid';
    //const UNREACHABLE = 'unreachable';

    const MARKERS = {
        [VALID]: '<svg xmlns="http://www.w3.org/2000/svg" width="0.8em" style="position: absolute; left: -0.6em; top: -0.2em;" viewbox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="rgb(0, 200, 0)" /><path d="M 10,20 18,28 33,14" fill="none" stroke="white" stroke-width="6"/></svg>',
        [INVALID]: '<svg xmlns="http://www.w3.org/2000/svg" width="0.8em" style="position: absolute; left: -0.6em; top: -0.2em;" viewbox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="rgb(200, 0, 0)" /><path d="M 10,10 30,30 M 10,30 30,10" fill="none" stroke="white" stroke-width="6"/></svg>',
        //[UNREACHABLE]: '',
    };

    let remainingBacklinksByLink = {};

    function forEachRelMe(link, callback) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: link.href,
            responseType: 'document',
            headers: {
                'User-Agent': 'rel=me',
                'Accept': '*/*',
                'Host': link.hostname,
            },
            onload: function (response) {
                if (response.status < 200 || response.status >= 400) {
                    console.log("rel=me: " + link.href + " is unreachable, skipping"); // TODO: Add marker and state for this.
                    return;
                }
                let potentialBacklinks = response.response.querySelectorAll('a[rel~=me]');
                console.log("rel=me: Found " + potentialBacklinks.length + " candidates for backlinking from " + link.href);

                if (potentialBacklinks.length === 0) {
                    verify(link, INVALID);
                    return;
                };

                remainingBacklinksByLink[link] = potentialBacklinks.length; // This counter will be used to track when the link can be marked as INVALID, that is, when we have found that none of the potential backlinks link to currentUrl.
                potentialBacklinks.forEach(callback);
            }
        });
    }

    function verify(link, state) {
        // Add the visual marker for `state` to the `link`.

        if (link.classList.contains('relme-verified')) {
            return; // It's possible that the page contained multiple rel=me links back here, only add one marker.
        }

        if (state === VALID) {
            console.log("rel=me: Verified link from " + link.href);
        }
        else {
            console.log("rel=me: No backlink found from " + link.href);
        }

        link.classList.add('relme-verified')
        link.classList.add('relme-' + state);

        let verifiedMark = document.createElement('span');
        verifiedMark.classList = ['relme-marker'];
        verifiedMark.innerHTML = MARKERS[state];
        verifiedMark.style.position = 'relative';
        verifiedMark.style.height = '0px';
        verifiedMark.style.opacity = '0.3';

        link.insertAdjacentElement('afterbegin', verifiedMark);
    }

    // Figure out where we are, and find all of the rel=me links.
    let currentUrl = window.location.href;
    let canon = document.querySelector("link[rel~=canonical]");
    if (canon) {
        currentUrl = canon.href;
    }
    currentUrl = currentUrl.split('#')[0];

    let availableLinks = document.querySelectorAll('a[rel~=me]');

    // Scan all of the rel=me links we found on the page.
    availableLinks.forEach(function (link) {
        // TODO: Strict mode which refuses to use insecure links.
        if (!link.protocol.startsWith('http')) {
            console.log("rel=me: Skipping non-HTTP link to " + link.href);
            return;
        }

        // The representative h-card usually has a link to itself, that case is trivial and it would be stupid to fetch ourselves.
        if (link.href === currentUrl) {
            console.log("rel=me: Self-referential link, automatically verified");
            verify(link, VALID);
            return;
        }

        // For each rel=me on the linked page, check to see if it's pointing back here (following any redirects).
        // There's no point in fetching the actual content, so we do HEAD.
        forEachRelMe(link, function (potentialBacklink) {
            GM_xmlhttpRequest({
                method: 'HEAD',
                url: potentialBacklink.href,
                headers: {
                    'User-Agent': 'rel=me', // Need a fake user-agent to follow t.co redirects.
                    'Accept': '*/*',
                    'Host': potentialBacklink.hostname,
                },
                timeout: 5000,
                onload: function (response) {
                    --remainingBacklinksByLink[link];

                    if (response.finalUrl !== currentUrl) {
                        if (remainingBacklinksByLink[link] === 0) {
                            verify(link, INVALID);
                        }
                        return;
                    }

                    verify(link, VALID);
                },
            });
        });
    });
})();
