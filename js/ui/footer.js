/* =========================
   FOOTER
   ========================= */

const FOOTER_PARTNERS = [
    {
        id: 'wardogs-hub',
        label: 'Community partner',
        name: 'WARDOGSHUB',
        url: 'https://wardogshub.net/?utm_source=wardogs-artillery&utm_medium=partner&utm_campaign=footer'
    }
];

function createFooterPartner(partner) {
    const item =
        document.createElement(
            'span'
        );

    item.className =
        'footer-partner';

    const label =
        document.createElement(
            'span'
        );

    label.className =
        'footer-partner-label';

    label.textContent =
        `${partner.label}:`;

    const link =
        document.createElement(
            'a'
        );

    link.className =
        'footer-partner-link';

    link.href =
        partner.url;

    link.target =
        '_blank';

    link.rel =
        'noopener noreferrer';

    link.textContent =
        partner.name;

    link.addEventListener(
        'click',
        () => {
            if (
                typeof trackAnalytics ===
                'function'
            ) {
                trackAnalytics(
                    'partner-click',
                    {
                        partner:
                            partner.id,

                        placement:
                            'footer'
                    }
                );
            }
        }
    );

    item.append(
        label,
        link
    );

    return item;
}

function renderFooter() {
    const footer =
        $('siteFooter') ||
        document.querySelector('footer');

    if (!footer) {
        return;
    }

    const config =
        APP_CONFIG
            ?.site
            ?.footer || {};

    footer.innerHTML = '';

    const disclaimer =
        document.createElement(
            'span'
        );

    disclaimer.className =
        'footer-disclaimer';

    disclaimer.textContent =
        config.disclaimer || '';

    const meta =
        document.createElement(
            'span'
        );

    meta.className =
        'footer-meta';

    if (FOOTER_PARTNERS.length) {
        const partners =
            document.createElement(
                'span'
            );

        partners.className =
            'footer-partners';

        FOOTER_PARTNERS.forEach(
            partner => {
                partners.appendChild(
                    createFooterPartner(
                        partner
                    )
                );
            }
        );

        meta.appendChild(
            partners
        );
    }

    const author =
        document.createElement(
            'span'
        );

    author.className =
        'footer-author';

    const productName =
        String(
            config.productName ||
            'WARDOGS Artillery Calculator'
        );

    const authorLabel =
        String(
            config.authorLabel ||
            'by'
        );

    author.append(
        document.createTextNode(
            `${productName} ${authorLabel} `
        )
    );

    const link =
        document.createElement(
            'a'
        );

    link.href =
        config.authorUrl || '#';

    link.target =
        '_blank';

    link.rel =
        'noopener noreferrer';

    const strong =
        document.createElement(
            'strong'
        );

    strong.textContent =
        config.authorName ||
        'Apollyon';

    link.appendChild(
        strong
    );

    author.appendChild(
        link
    );

    if (config.version) {
        const version =
            document.createElement(
                'span'
            );

        version.className =
            'footer-version';

        version.textContent =
            `(${config.version})`;

        author.appendChild(
            version
        );
    }

    meta.appendChild(
        author
    );

    if (disclaimer.textContent) {
        footer.appendChild(
            disclaimer
        );
    }

    footer.appendChild(
        meta
    );
}
