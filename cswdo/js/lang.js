/* =========================================================
   CSWDO MIS - LANGUAGE TOGGLE (English / Tagalog)
   Elements carry data-en / data-tl. The switcher swaps the
   element's content and remembers the choice.
   ========================================================= */

(function () {
    'use strict';

    var STORAGE_KEY = 'cswdo-lang';
    var DEFAULT_LANG = 'en';

    function applyLanguage(lang) {
        var isTl = lang === 'tl';

        // Swap the text of every translatable element
        var nodes = document.querySelectorAll('[data-en]');

        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var value = el.getAttribute(isTl ? 'data-tl' : 'data-en');

            if (value !== null) {
                el.innerHTML = value;
            }
        }

        // Update the document language
        document.documentElement.lang = isTl ? 'tl' : 'en';

        // Reflect the active state on the buttons
        var buttons = document.querySelectorAll('.langBtn');

        for (var j = 0; j < buttons.length; j++) {
            var active = buttons[j].getAttribute('data-lang') === lang;
            buttons[j].classList.toggle('is-active', active);
            buttons[j].setAttribute('aria-pressed', active ? 'true' : 'false');
        }

        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch (e) {
            /* storage unavailable - ignore */
        }
    }

    document.addEventListener('DOMContentLoaded', function () {

        var buttons = document.querySelectorAll('.langBtn');

        for (var i = 0; i < buttons.length; i++) {
            buttons[i].addEventListener('click', function () {
                applyLanguage(this.getAttribute('data-lang'));
            });
        }

        var saved = DEFAULT_LANG;

        try {
            saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
        } catch (e) {
            saved = DEFAULT_LANG;
        }

        applyLanguage(saved);
    });

})();
