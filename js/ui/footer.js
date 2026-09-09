/* =========================
   DONATION LINKS
   ========================= */

const DONATION_LINKS = [
    {
        id: 'buy-me-a-coffee',
        label: 'Buy me a coffee',
        url: 'https://www.buymeacoffee.com/apollyonsys',
        icon: `
            <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <path d="M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V8Z"></path>
                <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"></path>
                <path d="M7 5h7"></path>
            </svg>
        `
    },
    {
        id: 'ko-fi',
        label: 'Support me on Ko-fi',
        url: 'https://ko-fi.com/D3J32528AD',
        icon: `
            <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <path d="M4 7h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V7Z"></path>
                <path d="M17 9h1.25a2.75 2.75 0 0 1 0 5.5H17"></path>
                <path d="M8 10.2c.8-.9 2.1-.4 2.5.4.4-.8 1.7-1.3 2.5-.4 1.2 1.3-.4 2.7-2.5 4.1-2.1-1.4-3.7-2.8-2.5-4.1Z"></path>
            </svg>
        `
    }
];

function createDonationLink(
    donation,
    placement
) {

    const link =
        document.createElement(
            'a'
        );

    link.className =
        `donation-link donation-link-${donation.id}`;

    link.href =
        donation.url;

    link.target =
        '_blank';

    link.rel =
        'noopener noreferrer';

    link.setAttribute(
        'aria-label',
        donation.label
    );

    const icon =
        document.createElement(
            'span'
        );

    icon.className =
        'donation-link-icon';

    icon.innerHTML =
        donation.icon;

    const label =
        document.createElement(
            'span'
        );

    label.className =
        'donation-link-label';

    label.textContent =
        donation.label;

    link.append(
        icon,
        label
    );

    link.addEventListener(
        'click',
        () => {
            if (
                typeof trackAnalytics ===
                'function'
            ) {
                trackAnalytics(
                    'donation-click',
                    {
                        service:
                            donation.id,

                        placement
                    }
                );
            }
        }
    );

    return link;
}

function createDonationLinks(
    placement = 'footer'
) {

    const links =
        document.createElement(
            'span'
        );

    links.className =
        `donation-links donation-links-${placement}`;

    DONATION_LINKS.forEach(
        donation => {
            links.appendChild(
                createDonationLink(
                    donation,
                    placement
                )
            );
        }
    );

    return links;
}
