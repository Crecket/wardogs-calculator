/* =========================
   FORCE PLACEMENT MODE
   ========================= */

/*
 * When enabled, a map click always places the point selected
 * in Point selection instead of grabbing whichever marker
 * happens to be nearest to the click.
 */
let FORCE_PLACEMENT = false;

function isForcePlacementEnabled() {
    return FORCE_PLACEMENT;
}

function setForcePlacement(enabled) {
    FORCE_PLACEMENT =
        Boolean(enabled);

    updateForcePlacementUI();
}

function toggleForcePlacement() {
    setForcePlacement(
        !isForcePlacementEnabled()
    );
}

function updateForcePlacementUI() {

    const button =
        $('forcePlacementMode');

    if (!button) {
        return;
    }

    const enabled =
        isForcePlacementEnabled();

    button.textContent = tr(
        'forcePlacement'
    );

    button.classList.toggle(
        'active',
        enabled
    );

    button.setAttribute(
        'aria-pressed',
        enabled
            ? 'true'
            : 'false'
    );

    button.title = tr(
        enabled
            ? 'forcePlacementHintActive'
            : 'forcePlacementHint'
    );
}
