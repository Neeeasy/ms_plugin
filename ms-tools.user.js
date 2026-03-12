// ==UserScript==
// @name         MS Tools
// @namespace    ms-tools
// @version      1.6.1
// @description  Инструменты для работы с ролями и задачами
// @author       Kirill
// @match        http://*/*
// @match        https://*/*
// @icon         https://app.mstroy.tech/favicon.ico
// @updateURL    https://raw.githubusercontent.com/Neeeasy/ms_plugin/main/ms-tools.user.js
// @downloadURL  https://raw.githubusercontent.com/Neeeasy/ms_plugin/main/ms-tools.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const TARGET_ROLE = 'Возможность вносить изменения в сменные задания за прошлый период';

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
            const textarea = document.Element('textarea');
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
    font-size:14px;
    line-height:1;
    padding:2px 4px;
    border-radius:4px;
    opacity:0;
    transform:scale(.9);
    transition:opacity .15s ease, transform .15s ease;
    flex:0 0 auto;
}

.ag-row:hover .mstroy-cipher-copy-btn{
    opacity:1;
    transform:scale(1);
}

.mstroy-cipher-copy-btn:hover{
    background:rgba(25,118,210,0.08);
}

.mstroy-cipher-tooltip{
    background:rgba(33,33,33,.95);
    color:#fff;
    padding:6px 10px;
    border-radius:6px;
    font-size:12px;
    font-weight:600;
    white-space:nowrap;
    box-shadow:0 4px 14px rgba(0,0,0,.18);
    opacity:1;
    transition:opacity .18s ease, transform .18s ease;
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

    function tick() {
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

        document.addEventListener('click', () => {
            setTimeout(tick, 50);
            setTimeout(tick, 200);
            setTimeout(() => {
                if (isTasksRegistryPage()) {
                    scheduleEnhanceCipherCells(0);
                }
            }, 80);
        }, true);

        document.addEventListener('change', () => {
            setTimeout(updateControls, 100);
            if (isTasksRegistryPage()) {
                scheduleEnhanceCipherCells(0);
            }
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
        setTimeout(() => {
            if (isTasksRegistryPage()) {
                scheduleEnhanceCipherCells(0);
            }
        }, 1500);

        console.log('MS Tools v1.5 loaded');
    }

    patchHistoryMethods();
    start();
})();
