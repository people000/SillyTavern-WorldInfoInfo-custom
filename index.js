import { event_types, eventSource } from '../../../../script.js';
import { executeSlashCommandsWithOptions } from '../../../slash-commands.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { delay } from '../../../utils.js';

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

const init = ()=>{
    const trigger = document.createElement('div'); {
        trigger.classList.add('stwii--trigger');
        trigger.classList.add('fa-solid', 'fa-fw', 'fa-book-atlas');
        trigger.title = 'Active WI';
        trigger.addEventListener('click', ()=>{
            panel.style.display = panel.style.display == '' ? 'flex' : '';
        });
        document.body.append(trigger);
    }
    const panel = document.createElement('div'); {
        panel.classList.add('stwii--panel');
        panel.innerHTML = '?';
        document.body.append(panel);
    }

    let entries = [];
    let count = -1;
    const updateBadge = async(newEntries)=>{
        if (count != newEntries.length) {
            if (newEntries.length == 0) {
                trigger.classList.add('stwii--badge-out');
                await delay(510);
                trigger.setAttribute('data-stwii--badge-count', newEntries.length.toString());
                trigger.classList.remove('stwii--badge-out');
            } else if (count == 0) {
                trigger.classList.add('stwii--badge-in');
                trigger.setAttribute('data-stwii--badge-count', newEntries.length.toString());
                await delay(510);
                trigger.classList.remove('stwii--badge-in');
            } else {
                trigger.setAttribute('data-stwii--badge-count', newEntries.length.toString());
                trigger.classList.add('stwii--badge-bounce');
                await delay(1010);
                trigger.classList.remove('stwii--badge-bounce');
            }
            count = newEntries.length;
        } else if (new Set(newEntries).difference(new Set(entries)).size > 0) {
            trigger.classList.add('stwii--badge-bounce');
            await delay(1010);
            trigger.classList.remove('stwii--badge-bounce');
        }
        entries = newEntries;
    };
    eventSource.on(event_types.WORLD_INFO_ACTIVATED, async(entryList)=>{
        panel.innerHTML = 'Updating...';
        updateBadge(entryList.map(it=>`${it.world}§§§${it.uid}`));
        for (const entry of entryList) {
            entry.sticky = parseInt(await SlashCommandParser.commands['wi-get-timed-effect'].callback(
                {
                    effect: 'sticky',
                    format: 'number',
                    file: entry.world,
                },
                entry.uid,
            ));
        }
        panel.innerHTML = '';
        const grouped = Object.groupBy(entryList, (it,idx)=>it.world);
        trigger.style.display = 'block';
        for (const [world, entries] of Object.entries(grouped)) {
            const w = document.createElement('div'); {
                w.classList.add('stwiii--world');
                w.textContent = world;
                const style = {
                    fontWeight: 'bold',
                };
                for (const [k, v] of Object.entries(style)) {
                    w.style.setProperty(k.replace(/[A-Z]/g, (c)=>`-${c.toLowerCase()}`), v);
                }
                panel.append(w);
                for (const entry of entries) {
                    // const sticky = parseInt((await executeSlashCommandsWithOptions(`/wi-get-timed-effect effect=sticky format=number file="${world.replace(/"/g, '\\"')}" ${entry.uid}`)).pipe);
                    const e = document.createElement('div'); {
                        e.classList.add('stwiii--entry');
                        e.textContent = [
                            strategy[getStrategy(entry)],
                            entry.comment?.length ? entry.comment : entry.key.join(', '),
                            entry.sticky ? `📌 ${entry.sticky}` : null,
                        ].filter(it=>it).join(' ');
                        const style = {
                            paddingLeft: '1em',
                        };
                        for (const [k, v] of Object.entries(style)) {
                            e.style.setProperty(k.replace(/[A-Z]/g, (c)=>`-${c.toLowerCase()}`), v);
                        }
                        panel.append(e);
                    }
                }
            }
        }
    });

    //! HACK: no event when no entries are activated, only a debug message
    const original_debug = console.debug;
    console.debug = function(...args) {
        if (args[0] == '[WI] Found 0 world lore entries. Sorted by strategy') {
            trigger.style.display = 'none';
            panel.style.display = 'none';
            panel.innerHTML = 'No active entries';
        }
        return original_debug.bind(this)(...args);
    };
};
init();
