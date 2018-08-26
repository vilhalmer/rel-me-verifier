// ==UserScript==
// @name         rel=me verifier
// @namespace    lv.vil.relme
// @version      2.0
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

    function forEachAndThen(items, eachCallback, finalCallback) {
        // eachCallback: a function that takes (item, resultCallback) and calls resultCallback with the result of whatever operation it does to the item.
        // finalCallback: a function that takes an object mapping each item to the results of eachCallback for that item.

        let remaining = items.length;
        let results = new Map();

        if (remaining === 0) {
            finalCallback(results);
            return;
        }

        let finalWrapper = function (item, result) {
            --remaining;
            if (result !== null) {
                results.set(item, result);
            }
            if (remaining === 0) {
                finalCallback(results);
            }
        };

        items.forEach(function (item) {
            eachCallback(item, finalWrapper);
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

    function compareUrls(a, b) {
        let locationA = document.createElement('a');
        locationA.href = a;
        let locationB = document.createElement('a');
        locationB.href = b;
        return (locationA.host === locationB.host) && (locationA.pathname === locationB.pathname)
    }

    // Figure out where we are, and find all of the rel=me links.
    let currentUrl = window.location.href;
    let canon = document.querySelector("link[rel~=canonical]");
    if (canon) {
        currentUrl = canon.href;
    }
    currentUrl = currentUrl.split('#')[0];

    let availableLinks = document.querySelectorAll('a[rel~=me]');

    forEachAndThen(availableLinks, function (link, returnResult) {
        // For each rel=me link on the current page, we want to visit the other end.

        // TODO: Strict mode which refuses to use insecure links.
        if (!link.protocol.startsWith('http')) {
            console.log("rel=me: Skipping non-HTTP link to " + link.href);
            returnResult(link, null);
            return;
        }

        // The representative h-card usually has a link to itself, that case is trivial and it would be stupid to fetch ourselves.
        if (compareUrls(link.href, currentUrl)) {
            console.log("rel=me: Self-referential link, automatically verified");
            verify(link, VALID);
            returnResult(link, null);
            return;
        }

        // Resolve the page...
        GM_xmlhttpRequest({
            method: 'GET',
            url: link.href,
            responseType: 'document',
            headers: {'User-Agent': 'rel=me'},
            timeout: 5000,
            ontimeout: function (response) {
                returnResult(link, null);
            },
            onerror: function (response) {
                returnResult(link, null);
            },
            onload: function (response) {
                if (response.status < 200 || response.status >= 400) {
                    console.log("rel=me: " + link.href + " is unreachable, skipping"); // TODO: Add marker and state for this.
                    returnResult(link, null);
                    return;
                }
                if (response.response === undefined) {
                    returnResult(link, null);
                    return;
                }
                let potentialBacklinks = response.response.querySelectorAll('a[rel~=me]');
                console.log("rel=me: Found " + potentialBacklinks.length + " candidates for backlinking from " + link.href);

                // ...and return all of the rel=me links on the other end.
                returnResult(link, potentialBacklinks);
            }
        })
    }, function (potentialBacklinksByLink) {
        // Now we have a map of links on the current page to links on the other end. We make sure to keep these all in
        // one place because we're going to need to loop over them a second time later on. Otherwise, we could have
        // immediately done this next bit up above.
        forEachAndThen(Array.from(potentialBacklinksByLink.entries()), function ([link, potentialBacklinks], returnResult) {
            // For each link on the current page...
            forEachAndThen(potentialBacklinks, function(potentialBacklink, returnResult) {
                // ...check whether each of its backlinks is valid by following it...
                if (!potentialBacklink.protocol.startsWith('http')) {
                    returnResult(potentialBacklink, null);
                    return;
                }

                GM_xmlhttpRequest({
                    method: 'HEAD',
                    url: potentialBacklink.href,
                    headers: {'User-Agent': 'rel=me'}, // Need a fake user-agent to follow t.co redirects.
                    responseType: 'document',
                    timeout: 5000,
                    onerror: function (response) {
                        returnResult(potentialBacklink, null);
                    },
                    ontimeout: function (response) {
                        returnResult(potentialBacklink, null);
                    },
                    onload: function (response) {
                        // ...and returning whether it leads to the current page...
                        // (Note that we cheat here and transform the returned item to the final URL instead of the
                        // original backlink. This is so we can avoid needing to re-resolve them later.)
                        returnResult(response.finalUrl, compareUrls(response.finalUrl, currentUrl));
                    },
                });
            }, function (validityByBacklink) {
                // ...ultimately determining whether at least one backlink found at the link leads here.
                returnResult(link, validityByBacklink);
            });

        }, function (stageOneBacklinkValidityByLink) {
            // Now we know which of the links on the current page have valid backlinks.
            // We could stop here. However, we can be even more accurate by looking over the links one more time
            // to see if any of them point at any of the remote sites we now know are valid.

            // Create a simple map of link -> validity instead of the nested mess we currently have.
            // Also collect any currently invalid links so we don't need to iterate over the entire list
            // again, but rather just those.
            let stageTwoValidityByLink = new Map();
            let validityByHref = {};
            let stageTwoCandidates = [];
            Array.from(stageOneBacklinkValidityByLink.entries()).forEach(function ([link, backlinkValidity]) {
                let valid = Array.from(backlinkValidity.entries()).some(([_, v]) => v);
                stageTwoValidityByLink.set(link, valid);
                validityByHref[link] = valid; // Implicit cast to string, which is useful when comparing hrefs in a moment.
                if (!valid) {
                    stageTwoCandidates.push([link, backlinkValidity]);
                }
            });

            // (The variable name here is a bit misleading. Logging is hard.)
            console.log("rel=me: Stage one validity: ", stageTwoValidityByLink);

            // Now try to validate the currently invalid links by checking if they backlink to a valid one.
            stageTwoCandidates.forEach(function ([link, backlinkValidity]) {
                Array.from(backlinkValidity.entries()).forEach(function ([potentialBacklink, _]) {
                    // We can only become valid here, not invalid if it was already valid (OR, not AND).
                    if (validityByHref[potentialBacklink]) {
                        stageTwoValidityByLink.set(link, true);
                    }
                });
            });

            // And now, finally, we are done.
            console.log("rel=me: Stage two validity: ", stageTwoValidityByLink);

            Array.from(stageTwoValidityByLink.entries()).forEach(function ([link, valid]) {
                verify(link, valid ? VALID : INVALID); // Can never handle UNREACHABLE here, won't get this far.
            });
        });
    });
})();
