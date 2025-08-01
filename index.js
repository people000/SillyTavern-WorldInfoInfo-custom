import { chat, chat_metadata, event_types, eventSource, main_api, saveSettingsDebounced } from '../../../../script.js';
import { metadata_keys } from '../../../authors-note.js';
import { extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';
import { promptManager } from '../../../openai.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { delay } from '../../../utils.js';
import { world_info_position } from '../../../world-info.js';
import { POPUP_TYPE, Popup } from '../../../popup.js';

const extensionName = "SillyTavern-WorldInfoInfo-custom";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const strategy = {
    constant: '🔵',
    normal: '🟢',
    vectorized: '🔗',
};
const getStrategy = (entry)=>{
    if (entry.constant === true) {
        return 'constant';
    } else if (entry.vectorized === true) {
        return 'vectorized';
    } else {
        return 'normal';
    }
};

let generationType;
eventSource.on(event_types.GENERATION_STARTED, (genType)=>generationType = genType);


// 데이터 저장을 위한 변수들
let currentEntryList = [];
let currentChat = [];
let badgeCount = -1;
let hoverPanel;


// [팝업용 함수] 마술봉 메뉴 클릭 시 팝업을 엽니다.
const openWorldInfoPopup = async () => {
    const template = $(await renderExtensionTemplateAsync(`third-party/${extensionName}`, 'template'));
    const popupPanel = template.find('.stwii--panel');
    addIconToggleOption(popupPanel.parent());
    updatePanel(popupPanel, currentEntryList, true);
    const popup = new Popup(template, POPUP_TYPE.TEXT, {
        title: 'Active WorldInfo',
        buttons: [{ text: 'Close', action: 'close' }],
        wide: true,
        large: false,
    });
    await popup.show();
};

// [패널용 함수] 채팅 아이콘 클릭 시 패널을 엽니다. (수정됨)
const toggleHoverPanel = () => {
    if (!hoverPanel) return;

    const icon = document.querySelector('#stwii-chat-icon');
    const isActive = hoverPanel.classList.toggle('stwii--isActive');

    if (isActive) {
        // 패널이 활성화될 때 위치를 계산하고 내용을 업데이트
        const rect = icon.getBoundingClientRect();
        hoverPanel.style.left = `${rect.right + 5}px`; // 아이콘 오른쪽에 5px 여백
        hoverPanel.style.bottom = `${window.innerHeight - rect.bottom}px`; // 아이콘 아래쪽에 맞춤
        updatePanel($(hoverPanel), currentEntryList, true);
    }
};


// 마술봉 메뉴에 버튼을 추가합니다.
const addToWandMenu = async () => {
    try {
        const buttonHtml = await $.get(`${extensionFolderPath}/button.html`);
        const extensionsMenu = $("#extensionsMenu");
        if (extensionsMenu.length > 0) {
            extensionsMenu.append(buttonHtml);
            $("#worldinfo_info_button").on("click", openWorldInfoPopup);
        } else {
            setTimeout(addToWandMenu, 1000);
        }
    } catch (error) {
        console.error("WorldInfo Info: Failed to load button template.", error);
        setTimeout(addToWandMenu, 1000);
    }
};

// 채팅창 옆에 아이콘을 추가합니다.
const addChatBarIcon = () => {
    if ($('#stwii-chat-icon').length > 0) return;

    const icon = document.createElement('div');
    icon.id = 'stwii-chat-icon';
    icon.classList.add('fa-solid', 'fa-book-atlas', 'interactable');
    icon.title = 'Active WorldInfo\n(Click to toggle panel)';
    icon.addEventListener('click', toggleHoverPanel);

    const leftSendForm = document.querySelector('#leftSendForm');
    if (leftSendForm) {
        leftSendForm.append(icon);
    } else {
        setTimeout(addChatBarIcon, 500);
    }
};

// 원본 스타일의 호버 패널을 초기화하는 함수 (수정됨)
const initHoverPanel = () => {
    if ($('#stwii-hover-panel').length > 0) return;

    hoverPanel = document.createElement('div');
    hoverPanel.id = 'stwii-hover-panel';
    hoverPanel.classList.add('stwii--hover-panel');
    hoverPanel.innerHTML = '?';

    document.body.append(hoverPanel);

    // 패널 외부를 클릭하면 닫히도록 이벤트 리스너 추가
    document.addEventListener('click', (event) => {
        const icon = document.querySelector('#stwii-chat-icon');
        if (!hoverPanel || !hoverPanel.classList.contains('stwii--isActive')) {
            return;
        }
        if (!hoverPanel.contains(event.target) && (!icon || !icon.contains(event.target))) {
            hoverPanel.classList.remove('stwii--isActive');
        }
    });
};


// 뱃지 숫자 업데이트 로직
const updateBadge = async (entryList) => {
    badgeCount = entryList.length;
    const icon = document.querySelector('#stwii-chat-icon');
    if (!icon) return;
    const currentCountOnIcon = Number(icon.getAttribute('data-stwii--badge-count')) || 0;
    if (currentCountOnIcon !== badgeCount) {
        if (badgeCount === 0) {
            icon.classList.add('stwii--badge-out');
            await delay(510);
            icon.setAttribute('data-stwii--badge-count', badgeCount.toString());
            icon.classList.remove('stwii--badge-out');
        } else if (currentCountOnIcon === 0) {
            icon.setAttribute('data-stwii--badge-count', badgeCount.toString());
            icon.classList.add('stwii--badge-in');
            await delay(510);
            icon.classList.remove('stwii--badge-in');
        } else {
            icon.setAttribute('data-stwii--badge-count', badgeCount.toString());
            icon.classList.add('stwii--badge-bounce');
            await delay(1010);
            icon.classList.remove('stwii--badge-bounce');
        }
    }
};

// 팝업 내 아이콘 표시/숨김 옵션 추가 함수
const addIconToggleOption = (container) => {
    const iconRow = document.createElement('label');
    iconRow.classList.add('stwii--configRow', 'stwii--icon-toggle');
    iconRow.title = 'Toggle the visibility of the icon in the chat bar';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = extension_settings.worldInfoInfo?.showIcon ?? true;
    cb.addEventListener('click', () => {
        if (!extension_settings.worldInfoInfo) {
            extension_settings.worldInfoInfo = {};
        }
        extension_settings.worldInfoInfo.showIcon = cb.checked;
        saveSettingsDebounced();

        if (cb.checked) {
            addChatBarIcon();
            initHoverPanel();
            setTimeout(() => {
                const icon = document.querySelector('#stwii-chat-icon');
                if (icon && badgeCount >= 0) {
                    icon.setAttribute('data-stwii--badge-count', badgeCount.toString());
                }
            }, 10);
        } else {
            $('#stwii-chat-icon').remove();
            $('#stwii-hover-panel')?.remove();
            hoverPanel = null;
        }
    });
    iconRow.append(cb);

    const lbl = document.createElement('div');
    lbl.textContent = 'Show icon in chat bar';
    iconRow.append(lbl);

    container.append(iconRow);
};


// 월드 정보 활성화 이벤트 리스너
eventSource.on(event_types.WORLD_INFO_ACTIVATED, async(entryList)=>{
    for (const entry of entryList) {
        entry.type = 'wi';
        entry.sticky = parseInt(/**@type {string}*/(await SlashCommandParser.commands['wi-get-timed-effect'].callback(
            { effect: 'sticky', format: 'number', file: `${entry.world}`, _scope: null, _abortController: null },
            entry.uid,
        )));
    }
    currentEntryList = [...entryList];
    updateBadge(currentEntryList);

    if (hoverPanel && hoverPanel.classList.contains('stwii--isActive')) {
        updatePanel($(hoverPanel), currentEntryList);
    }
});


// 팝업/패널 내용을 그리는 함수 (변경 없음)
const updatePanel = (panel, entryList, newChat = false)=>{
    panel.empty();
    if (entryList.length === 0) {
        panel.html('No active entries');
        return;
    }
    const isGrouped = extension_settings.worldInfoInfo?.group ?? true;
    const isOrdered = extension_settings.worldInfoInfo?.order ?? true;
    const isMes = extension_settings.worldInfoInfo?.mes ?? true;
    let grouped;
    if (isGrouped) {
        grouped = Object.groupBy(entryList, (it,idx)=>it.world);
    } else {
        grouped = { 'WI Entries': [...entryList] };
    }
    const depthPos = [world_info_position.ANBottom, world_info_position.ANTop, world_info_position.atDepth];
    for (const [world, entries] of Object.entries(grouped)) {
        for (const e of entries) {
            e.depth = e.position == world_info_position.atDepth ? e.depth : (chat_metadata[metadata_keys.depth] + (e.position == world_info_position.ANTop ? 0.1 : 0));
        }
        const w = document.createElement('div'); {
            w.classList.add('stwii--world');
            w.textContent = world;
            panel.append(w);
            entries.sort((a,b)=>{
                if (isOrdered) {
                    if (!depthPos.includes(a.position) && !depthPos.includes(b.position)) return a.position - b.position;
                    if (depthPos.includes(a.position) && !depthPos.includes(b.position)) return 1;
                    if (!depthPos.includes(a.position) && depthPos.includes(b.position)) return -1;
                    if ((a.depth ?? Number.MAX_SAFE_INTEGER) < (b.depth ?? Number.MAX_SAFE_INTEGER)) return 1;
                    if ((a.depth ?? Number.MAX_SAFE_INTEGER) > (b.depth ?? Number.MAX_SAFE_INTEGER)) return -1;
                    if ((a.order ?? Number.MAX_SAFE_INTEGER) > (b.order ?? Number.MAX_SAFE_INTEGER)) return 1;
                    if ((a.order ?? Number.MAX_SAFE_INTEGER) < (b.order ?? Number.MAX_SAFE_INTEGER)) return -1;
                    return (a.comment ?? a.key.join(', ')).toLowerCase().localeCompare((b.comment ?? b.key.join(', ')).toLowerCase());
                } else {
                    return (a.comment?.length ? a.comment : a.key.join(', ')).toLowerCase().localeCompare(b.comment?.length ? b.comment : b.key.join(', '));
                }
            });
            if (!isGrouped && isOrdered && isMes) {
                const an = chat_metadata[metadata_keys.prompt];
                const ad = chat_metadata[metadata_keys.depth];
                if (an?.length) {
                    const idx = entries.findIndex(e=>depthPos.includes(e.position) && e.depth <= ad);
                    entries.splice(idx, 0, { type: 'note', position: world_info_position.ANBottom, depth: ad, text: an });
                }
                if (newChat) {
                    currentChat = [...chat];
                    if (generationType == 'swipe') currentChat.pop();
                }
                const segmenter = new Intl.Segmenter('en', { granularity:'sentence' });
                let currentDepth = currentChat.length - 1;
                let isDumped = false;
                for (let i = entries.length - 1; i >= -1; i--) {
                    if (i < 0 && currentDepth < 0) continue;
                    if (isDumped) continue;
                    if ((i < 0 && currentDepth >= 0) || (i >= 0 && !depthPos.includes(entries[i].position))) {
                        isDumped = true;
                        const depth = -1;
                        const mesList = currentChat.slice(depth + 1, currentDepth + 1);
                        const text = mesList.map(it=>it.mes).map(it=>it.replace(/```.+```/gs, '').replace(/<[^>]+?>/g, '').trim()).filter(it=>it.length).join('\n');
                        const sentences = [...segmenter.segment(text)].map(it=>it.segment.trim());
                        entries.splice(i + 1, 0, { type: 'mes', count: mesList.length, from: depth + 1, to: currentDepth, first: sentences.at(0), last: sentences.length > 1 ? sentences.at(-1) : null });
                        currentDepth = -1;
                        continue;
                    }
                    let depth = Math.max(-1, currentChat.length - entries[i].depth - 1);
                    if (depth >= currentDepth) continue;
                    depth = Math.ceil(depth);
                    if (depth == currentDepth) continue;
                    const mesList = currentChat.slice(depth + 1, currentDepth + 1);
                    const text = mesList.map(it=>it.mes).map(it=>it.replace(/```.+```/gs, '').replace(/<[^>]+?>/g, '').trim()).filter(it=>it.length).join('\n');
                    const sentences = [...segmenter.segment(text)].map(it=>it.segment.trim());
                    entries.splice(i + 1, 0, { type: 'mes', count: mesList.length, from: depth + 1, to: currentDepth, first: sentences.at(0), last: sentences.length > 1 ? sentences.at(-1) : null });
                    currentDepth = depth;
                }
            }
            for (const entry of entries) {
                const e = document.createElement('div'); {
                    e.classList.add('stwii--entry');
                    e.title = '';
                    if (entry.type == 'mes') e.classList.add('stwii--messages');
                    if (entry.type == 'note') e.classList.add('stwii--note');
                    const strat = document.createElement('div'); {
                        strat.classList.add('stwii--strategy');
                        if (entry.type == 'wi') {
                            strat.textContent = strategy[getStrategy(entry)];
                        } else if (entry.type == 'mes') {
                            strat.classList.add('fa-solid', 'fa-fw', 'fa-comments');
                            strat.setAttribute('data-stwii--count', entry.count.toString());
                        } else if (entry.type == 'note') {
                            strat.classList.add('fa-solid', 'fa-fw', 'fa-note-sticky');
                        }
                        e.append(strat);
                    }
                    const title = document.createElement('div'); {
                        title.classList.add('stwii--title');
                        if (entry.type == 'wi') {
                            title.textContent = entry.comment?.length ? entry.comment : entry.key.join(', ');
                            e.title += `[${entry.world}] ${entry.comment?.length ? entry.comment : entry.key.join(', ')}\n---\n${entry.content}`;
                        } else if (entry.type == 'mes') {
                            const first = document.createElement('div'); {
                                first.classList.add('stwii--first');
                                first.textContent = entry.first;
                                title.append(first);
                            }
                            if (entry.last) {
                                e.title = `Messages #${entry.from}-${entry.to}\n---\n${entry.first}\n...\n${entry.last}`;
                                const sep = document.createElement('div'); {
                                    sep.classList.add('stwii--sep');
                                    sep.textContent = '...';
                                    title.append(sep);
                                }
                                const last = document.createElement('div'); {
                                    last.classList.add('stwii--last');
                                    last.textContent = entry.last;
                                    title.append(last);
                                }
                            } else {
                                e.title = `Message #${entry.from}\n---\n${entry.first}`;
                            }
                        } else if (entry.type == 'note') {
                            title.textContent = 'Author\'s Note';
                            e.title = `Author's Note\n---\n${entry.text}`;
                        }
                        e.append(title);
                    }
                    const sticky = document.createElement('div'); {
                        sticky.classList.add('stwii--sticky');
                        sticky.textContent = entry.sticky ? `📌 ${entry.sticky}` : '';
                        sticky.title = `Sticky for ${entry.sticky} more rounds`;
                        e.append(sticky);
                    }
                    panel.append(e);
                }
            }
        }
    }
};

// 활성화된 항목이 없을 때 처리
//! HACK:
const original_debug = console.debug;
console.debug = function(...args) {
    if (args[0] == '[WI] Found 0 world lore entries. Sorted by strategy') {
        currentEntryList = [];
        updateBadge([]);
        if (hoverPanel && hoverPanel.classList.contains('stwii--isActive')) {
            updatePanel($(hoverPanel), []);
        }
    }
    return original_debug.bind(this)(...args);
};

// 확장 프로그램 초기화
jQuery(async () => {
    await addToWandMenu();
    if (extension_settings.worldInfoInfo?.showIcon ?? true) {
        addChatBarIcon();
        initHoverPanel();
    }
});