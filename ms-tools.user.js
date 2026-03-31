// ==UserScript==
// @name         MS Tools
// @namespace    ms-tools
// @version      1.6.4
// @description  Инструменты для работы с ролями, задачами, фильтрами и поиском по объектам проекта
// @author       Kirill
// @match        https://app.mstroy.tech/*
// @match        https://vsgm.app.mstroy.tech/*
// @match        https://ms1520.npsgk.ru/*
// @match        https://ms.ruhw.ru/*
// @match        https://mstroy.aodim.ru/*
// @match        https://rzd.mstroy.tech/*
// @match        https://app.dev-stroyka.online/*
// @match        https://app.bsmuk.ru/*
// @match        https://mstroy.elteza.ru/*
// @match        https://mstroy.fmp.ru/*
// @icon         https://app.mstroy.tech/favicon.ico
// @updateURL    https://raw.githubusercontent.com/Neeeasy/ms_plugin/main/ms-tools.user.js
// @downloadURL  https://raw.githubusercontent.com/Neeeasy/ms_plugin/main/ms-tools.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const TARGET_ROLE = 'Возможность вносить изменения в сменные задания за прошлый период';

    const IDS = {
        columnFilterWrap: 'mstroy-filter-search-wrap',
        columnFilterInput: 'mstroy-filter-search',
        projectObjectsWrap: 'mstroy-project-objects-search-wrap',
        projectObjectsInput: 'mstroy-project-objects-search',
    };

    let actionBtn = null;
    let statusText = null;
    let panel = null;
    let lastUrl = location.href;
    let intervalId = null;
    let filterEnabled = false;
    let filterBtnRef = null;

    let cipherObserver = null;
    let cipherInitDone = false;
    let cipherEnhanceTimer = null;

    let globalObserver = null;

    function normalize(text) {
        return (text || '')
            .replace(/\u00A0/g, ' ')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isVisible(el) {
        if (!el || !document.documentElement.contains(el)) return false;
        const s = window.getComputedStyle(el);
        return s.display !== 'none' &&
               s.visibility !== 'hidden' &&
               parseFloat(s.opacity || '1') !== 0;
    }

    function stopEvent(e) {
        e.stopPropagation();
    }

    function createSearchBox({ wrapId, inputId, placeholder, onInput }) {
        const wrap = document.createElement('div');
        wrap.id = wrapId;
        wrap.style.background = '#fff';
        wrap.style.padding = '8px 0 12px 0';
        wrap.style.width = '100%';
        wrap.style.boxSizing = 'border-box';

        const input = document.createElement('input');
        input.id = inputId;
        input.type = 'text';
        input.placeholder = placeholder;
        input.autocomplete = 'off';

        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        input.style.padding = '8px 12px';
        input.style.border = '1px solid #dcdfe6';
        input.style.borderRadius = '6px';
        input.style.fontSize = '14px';
        input.style.background = '#fff';
        input.style.outline = 'none';

        input.addEventListener('input', () => onInput(input.value));
        input.addEventListener('keydown', stopEvent);
        input.addEventListener('keyup', stopEvent);
        input.addEventListener('keypress', stopEvent);
        input.addEventListener('mousedown', stopEvent);
        input.addEventListener('click', stopEvent);

        wrap.appendChild(input);
        return { wrap, input };
    }

    function isCorrectPage() {
        return location.pathname.startsWith('/settings/userscontrol');
    }

    function isTasksRegistryPage() {
        return location.pathname.includes('/constructionTasksControl/construction/tasks');
    }

    function getRolesModal() {
        const candidates = [...document.querySelectorAll('div, section')];

        for (const el of candidates) {
            const text = el.innerText || '';

            if (
                text.includes('Редактирование пользователя') &&
                text.includes('Назначение ролей') &&
                text.includes('ПОЛЬЗОВАТЕЛЬ') &&
                text.includes('РОЛИ') &&
                text.includes('ИНТЕГРАЦИИ')
            ) {
                return el;
            }
        }

        return null;
    }

    function isRolesModalOpen() {
        if (!isCorrectPage()) return false;

        const modal = getRolesModal();
        if (!modal) return false;

        return modal.querySelectorAll('.q-checkbox__label').length > 0;
    }

    function getUserName(modal) {
        if (!modal) return '';

        const text = modal.innerText || '';
        const match = text.match(/Редактирование пользователя\s+([^\n]+)/i);

        if (match && match[1]) {
            return match[1].trim();
        }

        return '';
    }

    function getRoleItems(modal) {
        if (!modal) return [];

        const labels = [...modal.querySelectorAll('.q-checkbox__label')];

        return labels.map(label => {
            const checkbox = label.closest('.q-checkbox');
            const inner = checkbox?.querySelector('.q-checkbox__inner');

            return {
                label,
                checkbox,
                inner,
                row: checkbox?.parentElement,
                text: label.textContent.trim(),
                checked: !!inner?.classList.contains('q-checkbox__inner--truthy')
            };
        }).filter(item => item.checkbox && item.inner && item.row);
    }

    function getRoleItem(modal, roleName) {
        const items = getRoleItems(modal);
        return items.find(i => i.text === roleName) || null;
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            textarea.style.pointerEvents = 'none';

            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();

            const ok = document.execCommand('copy');
            textarea.remove();

            return ok;
        }
    }

    function buildTelegramText(action, fio) {
        return `${action} ${TARGET_ROLE}\n\n\`${fio}\``;
    }

    function showCopied() {
        if (!statusText) return;

        statusText.textContent = '✔ Скопировано для Telegram';
        statusText.className = 'mstroy-status mstroy-status-copy';

        setTimeout(updateControls, 1600);
    }

    async function toggleTargetRole() {
        const modal = getRolesModal();
        if (!modal) return;

        const roleItem = getRoleItem(modal, TARGET_ROLE);

        if (!roleItem) {
            setStatus('Роль не найдена');
            return;
        }

        const fio = getUserName(modal) || 'ФИО не найдено';
        const isGiveAction = actionBtn && actionBtn.textContent.includes('Выдать');

        roleItem.checkbox.click();

        if (isGiveAction) {
            const message = buildTelegramText('Забрать', fio);
            const copied = await copyToClipboard(message);

            if (copied) {
                showCopied();
            } else {
                setStatus('Ошибка копирования');
            }
        } else {
            setStatus('Роль забрана');
        }

        setTimeout(updateControls, 200);
        setTimeout(updateControls, 500);
    }

    function setStatus(text) {
        if (statusText) {
            statusText.textContent = text;
        }
    }

    function updateControls() {
        const modal = getRolesModal();
        if (!modal || !actionBtn) return;

        const roleItem = getRoleItem(modal, TARGET_ROLE);

        if (!roleItem) {
            actionBtn.style.display = 'none';

            if (statusText) {
                statusText.style.display = 'none';
            }

            updateFilter();
            return;
        }

        actionBtn.style.display = '';

        if (statusText) {
            statusText.style.display = '';
        }

        actionBtn.disabled = false;

        if (roleItem.checked) {
            actionBtn.textContent = 'Забрать прошлый период';
            statusText.textContent = 'Сейчас роль включена';
            statusText.className = 'mstroy-status mstroy-status-on';
        } else {
            actionBtn.textContent = 'Выдать прошлый период';
            statusText.textContent = 'Сейчас роль выключена';
            statusText.className = 'mstroy-status mstroy-status-off';
        }

        updateFilter();
    }

    function updateFilter() {
        const modal = getRolesModal();
        if (!modal) return;

        const items = getRoleItems(modal);

        items.forEach(item => {
            if (filterEnabled && !item.checked) {
                item.row.style.display = 'none';
            } else {
                item.row.style.display = '';
            }
        });
    }

    function createStyles() {
        if (document.getElementById('mstroy-style')) return;

        const style = document.createElement('style');
        style.id = 'mstroy-style';

        style.textContent = `
.mstroy-panel{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    margin:8px 0;
    padding:8px 10px;
    border:1px solid rgba(0,0,0,0.12);
    border-radius:6px;
    background:#fafafa;
}

.mstroy-panel-left{
    display:flex;
    align-items:center;
    gap:8px;
}

.mstroy-panel-right{
    display:flex;
    align-items:center;
    gap:8px;
    margin-left:auto;
}

.mstroy-btn{
    border:1px solid #1976d2;
    background:#fff;
    color:#1976d2;
    border-radius:6px;
    padding:6px 10px;
    font-size:13px;
    cursor:pointer;
}

.mstroy-btn:hover{
    background:rgba(25,118,210,0.08);
}

.mstroy-btn-active{
    background:#1976d2;
    color:#fff;
}

.mstroy-status{
    font-size:12px;
    font-weight:600;
}

.mstroy-status-on{
    color:#2e7d32;
}

.mstroy-status-off{
    color:#c62828;
}

.mstroy-status-copy{
    color:#1565c0;
}

.mstroy-cipher-wrap{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
    width:100%;
    min-width:0;
}

.mstroy-cipher-text{
    min-width:0;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    flex:1 1 auto;
}

.mstroy-cipher-copy-btn{
    border:none;
    background:transparent;
    cursor:pointer;
    width:24px;
    height:24px;
    min-width:24px;
    min-height:24px;
    padding:0;
    border-radius:6px;
    opacity:0;
    transform:scale(.92);
    transition:
        opacity .15s ease,
        transform .15s ease,
        background-color .15s ease,
        color .15s ease;
    flex:0 0 auto;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    color:#1976d2;
    position:relative;
}

.ag-row:hover .mstroy-cipher-copy-btn{
    opacity:1;
    transform:scale(1);
}

.mstroy-cipher-copy-btn:hover{
    background:rgba(25,118,210,0.10);
}

.mstroy-cipher-copy-btn:active{
    transform:scale(.96);
}

.mstroy-cipher-copy-btn-icon{
    position:absolute;
    inset:0;
    display:flex;
    align-items:center;
    justify-content:center;
    transition:
        opacity .16s ease,
        transform .16s ease;
}

.mstroy-cipher-copy-btn-icon svg{
    width:15px;
    height:15px;
    display:block;
}

.mstroy-cipher-copy-btn-icon-copy{
    opacity:1;
    transform:scale(1);
}

.mstroy-cipher-copy-btn-icon-check{
    opacity:0;
    transform:scale(.72);
    color:#2e7d32;
}

.mstroy-cipher-copy-btn.is-copied{
    background:rgba(46,125,50,0.10);
    color:#2e7d32;
    opacity:1;
}

.mstroy-cipher-copy-btn.is-copied .mstroy-cipher-copy-btn-icon-copy{
    opacity:0;
    transform:scale(.72);
}

.mstroy-cipher-copy-btn.is-copied .mstroy-cipher-copy-btn-icon-check{
    opacity:1;
    transform:scale(1);
}
`;

        document.head.appendChild(style);
    }

    function createControls() {
        createStyles();

        const modal = getRolesModal();
        if (!modal) return false;

        const listContainer = modal.querySelector('.q-checkbox')?.parentElement?.parentElement;
        if (!listContainer || !listContainer.parentElement) return false;

        panel = modal.querySelector('#mstroy-panel');

        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'mstroy-panel';
            panel.className = 'mstroy-panel';

            const left = document.createElement('div');
            left.className = 'mstroy-panel-left';

            const right = document.createElement('div');
            right.className = 'mstroy-panel-right';

            filterBtnRef = document.createElement('button');
            filterBtnRef.className = 'mstroy-btn';
            filterBtnRef.textContent = 'Только назначенные';

            filterBtnRef.addEventListener('click', () => {
                filterEnabled = !filterEnabled;
                filterBtnRef.classList.toggle('mstroy-btn-active', filterEnabled);
                updateFilter();
            });

            left.appendChild(filterBtnRef);

            actionBtn = document.createElement('button');
            actionBtn.className = 'mstroy-btn';
            actionBtn.textContent = '...';
            actionBtn.addEventListener('click', toggleTargetRole);

            statusText = document.createElement('div');
            statusText.className = 'mstroy-status';

            right.appendChild(actionBtn);
            right.appendChild(statusText);

            panel.appendChild(left);
            panel.appendChild(right);

            listContainer.parentElement.insertBefore(panel, listContainer);
        } else {
            filterBtnRef = panel.querySelector('.mstroy-panel-left .mstroy-btn');
            actionBtn = panel.querySelector('.mstroy-panel-right .mstroy-btn');
            statusText = panel.querySelector('.mstroy-status');
        }

        updateControls();
        return true;
    }

    function removeControls() {
        document.getElementById('mstroy-panel')?.remove();

        panel = null;
        actionBtn = null;
        statusText = null;
        filterBtnRef = null;
    }

    function getCipherCells() {
        return [...document.querySelectorAll('.ag-center-cols-container .ag-cell[col-id="cipher"], .ag-pinned-left-cols-container .ag-cell[col-id="cipher"], .ag-cell[col-id="cipher"]')];
    }

    function removeExistingCipherTooltip() {
        document.querySelectorAll('.mstroy-cipher-tooltip').forEach(el => el.remove());
    }

    function showCipherTooltip(target, text = 'Скопировано') {
        removeExistingCipherTooltip();

        const rect = target.getBoundingClientRect();
        const tooltip = document.createElement('div');

        tooltip.className = 'mstroy-cipher-tooltip';
        tooltip.textContent = text;
        tooltip.style.position = 'fixed';
        tooltip.style.left = `${rect.left + rect.width / 2}px`;
        tooltip.style.top = `${rect.top - 8}px`;
        tooltip.style.transform = 'translate(-50%, -100%)';
        tooltip.style.zIndex = '999999';
        tooltip.style.pointerEvents = 'none';

        document.body.appendChild(tooltip);

        setTimeout(() => {
            tooltip.style.opacity = '0';
            tooltip.style.transform = 'translate(-50%, calc(-100% - 4px))';
        }, 900);

        setTimeout(() => {
            tooltip.remove();
        }, 1200);
    }

    function createCipherCopyButton(cipherText) {
        const btn = document.createElement('button');
        btn.className = 'mstroy-cipher-copy-btn';
        btn.type = 'button';
        btn.title = `Скопировать шифр: ${cipherText}`;
        btn.setAttribute('aria-label', `Скопировать шифр ${cipherText}`);

        btn.innerHTML = `
            <span class="mstroy-cipher-copy-btn-icon mstroy-cipher-copy-btn-icon-copy" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                    <path d="M9 9.75A2.25 2.25 0 0 1 11.25 7.5h6A2.25 2.25 0 0 1 19.5 9.75v6A2.25 2.25 0 0 1 17.25 18h-6A2.25 2.25 0 0 1 9 15.75v-6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                    <path d="M15 7.5V6.75A2.25 2.25 0 0 0 12.75 4.5h-6A2.25 2.25 0 0 0 4.5 6.75v6A2.25 2.25 0 0 0 6.75 15H9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </span>
            <span class="mstroy-cipher-copy-btn-icon mstroy-cipher-copy-btn-icon-check" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                    <path d="M5 12.5 9.5 17 19 7.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </span>
        `;

        const stop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        };

        btn.addEventListener('mousedown', stop, true);
        btn.addEventListener('mouseup', stop, true);

        btn.addEventListener('click', async (e) => {
            stop(e);

            const ok = await copyToClipboard(cipherText);

            if (ok) {
                btn.classList.add('is-copied');
                showCipherTooltip(btn, 'Скопировано');

                setTimeout(() => {
                    btn.classList.remove('is-copied');
                }, 900);
            } else {
                showCipherTooltip(btn, 'Ошибка');
            }
        }, true);

        btn.addEventListener('dblclick', stop, true);

        return btn;
    }

    function buildCipherCellContent(cell, cipherText) {
        cell.dataset.mstroyCipherText = cipherText;

        const wrap = document.createElement('div');
        wrap.className = 'mstroy-cipher-wrap';

        const text = document.createElement('span');
        text.className = 'mstroy-cipher-text';
        text.textContent = cipherText;
        text.title = cipherText;

        const btn = createCipherCopyButton(cipherText);

        wrap.appendChild(text);
        wrap.appendChild(btn);

        cell.innerHTML = '';
        cell.appendChild(wrap);
    }

    function enhanceCipherCell(cell) {
        if (!cell || !cell.isConnected) return;

        const cipherText = (cell.getAttribute('title') || cell.textContent || '').trim();
        if (!cipherText) return;

        const currentWrap = cell.querySelector(':scope > .mstroy-cipher-wrap');
        const currentText = cell.dataset.mstroyCipherText || '';

        if (currentWrap && currentText === cipherText) {
            return;
        }

        buildCipherCellContent(cell, cipherText);
    }

    function enhanceCipherCells() {
        if (!isTasksRegistryPage()) return;

        const cells = getCipherCells();
        if (!cells.length) return;

        for (const cell of cells) {
            enhanceCipherCell(cell);
        }
    }

    function scheduleEnhanceCipherCells(delay = 0) {
        clearTimeout(cipherEnhanceTimer);

        cipherEnhanceTimer = setTimeout(() => {
            enhanceCipherCells();
        }, delay);
    }

    function startCipherObserver() {
        stopCipherObserver();

        if (!isTasksRegistryPage()) return;

        const gridRoot =
            document.querySelector('.ag-center-cols-container') ||
            document.querySelector('.ag-body-viewport') ||
            document.querySelector('.ag-root-wrapper') ||
            document.querySelector('.ag-root') ||
            document.body;

        cipherObserver = new MutationObserver((mutations) => {
            let shouldRefresh = false;

            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    shouldRefresh = true;
                    break;
                }

                if (mutation.type === 'attributes') {
                    const target = mutation.target;
                    if (target instanceof HTMLElement && target.matches('.ag-cell[col-id="cipher"]')) {
                        shouldRefresh = true;
                        break;
                    }
                }
            }

            if (shouldRefresh) {
                scheduleEnhanceCipherCells(10);
            }
        });

        cipherObserver.observe(gridRoot, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['title', 'col-id']
        });

        scheduleEnhanceCipherCells(0);
    }

    function stopCipherObserver() {
        if (cipherObserver) {
            cipherObserver.disconnect();
            cipherObserver = null;
        }

        clearTimeout(cipherEnhanceTimer);
        cipherEnhanceTimer = null;
    }

    function initCipherTools() {
        if (!isTasksRegistryPage()) {
            stopCipherObserver();
            return;
        }

        createStyles();
        scheduleEnhanceCipherCells(0);

        if (!cipherInitDone) {
            startCipherObserver();
            cipherInitDone = true;
        }
    }

    // =========================================================
    // 1. ПОИСК В "ФИЛЬТР ПО СТОЛБЦУ"
    // =========================================================

    function findOpenFilterModal() {
        const nodes = [...document.querySelectorAll('div, section')];

        for (const node of nodes) {
            if (!isVisible(node)) continue;
            const text = node.innerText || '';

            if (
                text.includes('Фильтр по столбцу') &&
                text.includes('Отменить') &&
                text.includes('Применить')
            ) {
                return node;
            }
        }

        return null;
    }

    function findFilterListContainer(modal) {
        if (!modal) return null;

        const checkboxes = [...modal.querySelectorAll('input[type="checkbox"]')];
        if (!checkboxes.length) return null;

        for (const checkbox of checkboxes) {
            let current = checkbox.parentElement;

            while (current && current !== modal) {
                const count = current.querySelectorAll('input[type="checkbox"]').length;
                const text = normalize(current.innerText);

                if (count >= 3 && text.length > 0) {
                    return current;
                }

                current = current.parentElement;
            }
        }

        return null;
    }

    function getFilterRows(listContainer) {
        if (!listContainer) return [];

        const checkboxes = [...listContainer.querySelectorAll('input[type="checkbox"]')];
        const rows = [];

        for (const checkbox of checkboxes) {
            let row = checkbox.closest('label') || checkbox.parentElement;

            while (row && row !== listContainer) {
                const rowText = normalize(row.innerText);
                const nestedCheckboxes = row.querySelectorAll('input[type="checkbox"]').length;

                if (rowText && nestedCheckboxes === 1) {
                    break;
                }

                row = row.parentElement;
            }

            if (row && row !== listContainer && !rows.includes(row)) {
                rows.push(row);
            }
        }

        return rows;
    }

    function applyFilterModalSearch(listContainer, query) {
        const q = normalize(query);
        const rows = getFilterRows(listContainer);

        rows.forEach(row => {
            const rowText = normalize(row.innerText);
            row.style.display = !q || rowText.includes(q) ? '' : 'none';
        });
    }

    function injectFilterModalSearch(modal) {
        if (!modal || !isVisible(modal)) return;

        const listContainer = findFilterListContainer(modal);
        if (!listContainer) return;

        const existing = modal.querySelector(`#${IDS.columnFilterWrap}`);
        if (existing) {
            const input = existing.querySelector('input');
            if (input) {
                applyFilterModalSearch(listContainer, input.value);
            }
            return;
        }

        const { wrap, input } = createSearchBox({
            wrapId: IDS.columnFilterWrap,
            inputId: IDS.columnFilterInput,
            placeholder: 'Поиск по значениям...',
            onInput: (value) => applyFilterModalSearch(listContainer, value)
        });

        wrap.style.position = 'sticky';
        wrap.style.top = '0';
        wrap.style.zIndex = '10';

        listContainer.insertBefore(wrap, listContainer.firstChild);

        setTimeout(() => {
            if (isVisible(input)) input.focus();
        }, 50);
    }

    // =========================================================
    // 2. ПОИСК В "ОБЪЕКТЫ ПРОЕКТА"
    // =========================================================

    function findProjectModal() {
        return document.querySelector('.EditProjectModal');
    }

    function findProjectTabs(modal) {
        if (!modal) return null;
        return modal.querySelector('.EditProjectModalTabs');
    }

    function findObjectsPanel(modal) {
        if (!modal) return null;
        return modal.querySelector('.EditProjectObjectsModal');
    }

    function getProjectObjectItems(modal) {
        if (!modal) return [];
        return [...modal.querySelectorAll('.ProjectObjectsPanelItem')];
    }

    function getProjectObjectSearchText(item) {
        if (!item) return '';

        const inputs = [...item.querySelectorAll('input, textarea')];
        const values = inputs
            .map(input => (input.value || '').trim())
            .filter(Boolean);

        const fullName = values[0] || '';
        const shortName = values[1] || '';

        return normalize(`${fullName} ${shortName}`);
    }

    function applyProjectObjectsSearch(modal, query) {
        const q = normalize(query);
        const items = getProjectObjectItems(modal);

        items.forEach(item => {
            const text = getProjectObjectSearchText(item);
            const match = !q || text.includes(q);

            item.style.display = match ? '' : 'none';
            item.style.visibility = match ? '' : 'hidden';
            item.style.pointerEvents = match ? '' : 'none';
        });

        const content = modal.querySelector('.EditProjectObjectsModal-virtualScroll .q-virtual-scroll__content');
        if (content) {
            requestAnimationFrame(() => {
                const hasVisible = items.some(item => item.style.display !== 'none');
                content.style.minHeight = !hasVisible && q ? '120px' : '';
            });
        }
    }

    function injectProjectObjectsSearch(modal) {
        if (!modal || !isVisible(modal)) return;

        const tabs = findProjectTabs(modal);
        const objectsPanel = findObjectsPanel(modal);
        if (!tabs || !objectsPanel) return;

        const existing = modal.querySelector(`#${IDS.projectObjectsWrap}`);
        if (existing) {
            const input = existing.querySelector('input');
            if (input) {
                applyProjectObjectsSearch(modal, input.value);
            }
            return;
        }

        const { wrap, input } = createSearchBox({
            wrapId: IDS.projectObjectsWrap,
            inputId: IDS.projectObjectsInput,
            placeholder: 'Поиск по полному и краткому наименованию...',
            onInput: (value) => applyProjectObjectsSearch(modal, value)
        });

        wrap.style.marginTop = '8px';
        wrap.style.marginBottom = '8px';
        wrap.style.flex = '0 0 auto';

        tabs.insertAdjacentElement('afterend', wrap);
    }

    function runSearchInjections() {
        const filterModal = findOpenFilterModal();
        if (filterModal) {
            injectFilterModalSearch(filterModal);
        }

        const projectModal = findProjectModal();
        if (projectModal) {
            injectProjectObjectsSearch(projectModal);

            const searchInput = projectModal.querySelector(`#${IDS.projectObjectsInput}`);
            if (searchInput) {
                applyProjectObjectsSearch(projectModal, searchInput.value);
            }
        }
    }

    function startGlobalObserver() {
        if (globalObserver) return;

        globalObserver = new MutationObserver(() => {
            runSearchInjections();

            if (isCorrectPage() && isRolesModalOpen()) {
                createControls();
                updateControls();
            }

            if (isTasksRegistryPage()) {
                scheduleEnhanceCipherCells(0);
            }
        });

        globalObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
        });
    }

    function tick() {
        runSearchInjections();

        if (isTasksRegistryPage()) {
            initCipherTools();
        } else {
            stopCipherObserver();
            cipherInitDone = false;
        }

        if (!isCorrectPage()) {
            removeControls();
            return;
        }

        if (!isRolesModalOpen()) {
            removeControls();
            return;
        }

        createControls();
        updateControls();
    }

    function onUrlChange() {
        if (location.href === lastUrl) return;

        lastUrl = location.href;
        removeControls();
        stopCipherObserver();
        cipherInitDone = false;

        setTimeout(tick, 100);
        setTimeout(tick, 500);
        setTimeout(tick, 1200);
    }

    function patchHistoryMethods() {
        const push = history.pushState;
        const replace = history.replaceState;

        history.pushState = function (...args) {
            const result = push.apply(this, args);
            window.dispatchEvent(new Event('tm-location-change'));
            return result;
        };

        history.replaceState = function (...args) {
            const result = replace.apply(this, args);
            window.dispatchEvent(new Event('tm-location-change'));
            return result;
        };
    }

    function start() {
        if (intervalId) return;

        createStyles();
        startGlobalObserver();

        document.addEventListener('click', () => {
            setTimeout(tick, 50);
            setTimeout(tick, 200);
            setTimeout(() => {
                if (isTasksRegistryPage()) {
                    scheduleEnhanceCipherCells(0);
                }
                runSearchInjections();
            }, 80);
        }, true);

        document.addEventListener('change', () => {
            setTimeout(updateControls, 100);

            if (isTasksRegistryPage()) {
                scheduleEnhanceCipherCells(0);
            }

            runSearchInjections();
        }, true);

        document.addEventListener('scroll', () => {
            if (isTasksRegistryPage()) {
                scheduleEnhanceCipherCells(0);
            }
        }, true);

        window.addEventListener('popstate', onUrlChange);
        window.addEventListener('tm-location-change', onUrlChange);
        window.addEventListener('resize', () => {
            if (isTasksRegistryPage()) {
                scheduleEnhanceCipherCells(0);
            }
        });

        intervalId = setInterval(() => {
            onUrlChange();
            tick();

            if (isTasksRegistryPage()) {
                scheduleEnhanceCipherCells(0);
            }
        }, 700);

        setTimeout(tick, 300);
        setTimeout(tick, 1000);
        setTimeout(tick, 1500);
        setTimeout(runSearchInjections, 400);
        setTimeout(runSearchInjections, 1200);
        setTimeout(runSearchInjections, 2500);

        console.log('MS Tools v1.6.3 loaded');
    }

    patchHistoryMethods();
    start();
})();
