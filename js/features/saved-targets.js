/* =========================
   SAVED TARGETS
   ========================= */

function generateTargetId() {

    return (
        Date.now().toString(36) +
        '-' +
        Math.random()
            .toString(36)
            .slice(2, 9)
    );
}

function loadSavedTargets() {

    try {

        const raw =
            localStorage.getItem(
                SAVED_TARGETS_KEY
            );

        if (!raw) {
            savedTargets = [];
            return;
        }

        const parsed =
            JSON.parse(raw);

        if (!Array.isArray(parsed)) {
            savedTargets = [];
            return;
        }

        savedTargets =
            parsed
                .filter(
                    target =>
                        target &&
                        typeof target.id === 'string' &&
                        typeof target.x === 'number' &&
                        typeof target.y === 'number'
                )
                .map(target => ({
                    ...target,

                    name:
                        typeof target.name === 'string' &&
                        target.name.trim()
                            ? target.name
                            : createTargetName()
                }));

    } catch (error) {

        console.error(
            'Failed to load saved targets:',
            error
        );

        savedTargets = [];
    }
}

function persistSavedTargets() {

    localStorage.setItem(
        SAVED_TARGETS_KEY,
        JSON.stringify(
            savedTargets
        )
    );
}

function getSaveArtilleryPreference() {

    return (
        localStorage.getItem(
            SAVE_ARTILLERY_KEY
        ) === 'true'
    );
}

function loadSaveArtilleryPreference() {

    const checkbox =
        $('saveArtilleryPosition');

    checkbox.checked =
        getSaveArtilleryPreference();
}

function saveArtilleryPreference() {

    localStorage.setItem(
        SAVE_ARTILLERY_KEY,
        checkboxValue(
            $('saveArtilleryPosition')
        )
            ? 'true'
            : 'false'
    );
}

function checkboxValue(element) {

    return Boolean(
        element &&
        element.checked
    );
}

function createTargetName() {

    let number =
        1;

    const existing =
        new Set(
            savedTargets.map(
                target =>
                    target.name
            )
        );

    while (
        existing.has(
            `Target ${number}`
        )
        ) {
        number++;
    }

    return `Target ${number}`;
}

function saveCurrentTarget() {

    const saveArtillery =
        checkboxValue(
            $('saveArtilleryPosition')
        );

    const target = {

        id:
            generateTargetId(),

        name:
            createTargetName(),

        x:
            Number(
                S.target.x
            ),

        y:
            Number(
                S.target.y
            ),

        saveArtillery,

        origin:
            saveArtillery
                ? {
                    x: Number(
                        S.origin.x
                    ),
                    y: Number(
                        S.origin.y
                    )
                }
                : null
    };

    savedTargets.push(
        target
    );

    selectedSavedTargetId =
        target.id;

    persistSavedTargets();

    renderSavedTargets();
}

function deleteTarget(id) {

    const index =
        savedTargets.findIndex(
            target =>
                target.id === id
        );

    if (index === -1) {
        return;
    }

    savedTargets.splice(
        index,
        1
    );

    if (
        selectedSavedTargetId === id
    ) {
        selectedSavedTargetId =
            null;
    }

    persistSavedTargets();

    renderSavedTargets();
}

function editTargetName(id) {

    const target =
        savedTargets.find(
            item =>
                item.id === id
        );

    if (!target) {
        return;
    }

    const name =
        window.prompt(
            tr('targetNamePrompt'),
            target.name
        );

    if (name === null) {
        return;
    }

    const trimmed =
        name.trim();

    if (!trimmed) {
        return;
    }

    target.name =
        trimmed;

    persistSavedTargets();

    renderSavedTargets();
}

function restoreTarget(target) {

    if (!target) {
        return;
    }

    S.target = {
        x: Number(target.x),
        y: Number(target.y)
    };

    if (
        target.saveArtillery &&
        target.origin &&
        typeof target.origin.x === 'number' &&
        typeof target.origin.y === 'number'
    ) {

        S.origin = {
            x: Number(target.origin.x),
            y: Number(target.origin.y)
        };
    }

    clamp(S.target);
    clamp(S.origin);

    selectedSavedTargetId =
        target.id;

    inputs();
    renderSavedTargets();
}

function renderSavedTargets() {

    const container =
        $('savedTargetsList');

    if (!container) {
        return;
    }

    container.innerHTML = '';

    const count =
        $('savedTargetsCount');

    if (count) {
        count.textContent =
            savedTargets.length;
    }

    if (!savedTargets.length) {

        const empty =
            document.createElement(
                'div'
            );

        empty.className =
            'saved-target-empty';

        empty.textContent =
            tr('noSavedTargets');

        container.appendChild(
            empty
        );

        return;
    }

    savedTargets.forEach(
        target => {

            const item =
                document.createElement(
                    'div'
                );

            item.className =
                'saved-target';

            if (
                target.id ===
                selectedSavedTargetId
            ) {
                item.classList.add(
                    'active'
                );
            }

            item.addEventListener(
                'click',
                () => {
                    restoreTarget(
                        target
                    );
                }
            );

            const info =
                document.createElement(
                    'div'
                );

            info.className =
                'saved-target-info';

            const name =
                document.createElement(
                    'span'
                );

            name.className =
                'saved-target-name';

            name.textContent =
                target.name;

            const coords =
                document.createElement(
                    'span'
                );

            coords.className =
                'saved-target-coords';

            coords.textContent =
                `X ${formatGameCoordinate(target.x)} · Y ${formatGameCoordinate(target.y)}`;

            info.appendChild(
                name
            );

            info.appendChild(
                coords
            );

            const actions =
                document.createElement(
                    'div'
                );

            actions.className =
                'saved-target-actions-inline';

            const edit =
                document.createElement(
                    'button'
                );

            edit.type =
                'button';

            edit.className =
                'saved-target-icon-button';

            edit.textContent =
                '✎';

            edit.title =
                tr('edit');

            edit.setAttribute(
                'aria-label',
                tr('edit')
            );

            edit.addEventListener(
                'click',
                event => {

                    event.stopPropagation();

                    editTargetName(
                        target.id
                    );
                }
            );

            const remove =
                document.createElement(
                    'button'
                );

            remove.type =
                'button';

            remove.className =
                'saved-target-icon-button';

            remove.textContent =
                '×';

            remove.title =
                tr('delete');

            remove.setAttribute(
                'aria-label',
                tr('delete')
            );

            remove.addEventListener(
                'click',
                event => {

                    event.stopPropagation();

                    deleteTarget(
                        target.id
                    );
                }
            );

            actions.appendChild(
                edit
            );

            actions.appendChild(
                remove
            );

            item.appendChild(
                info
            );

            item.appendChild(
                actions
            );

            container.appendChild(
                item
            );
        }
    );
}
