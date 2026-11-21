(function () {
    'use strict';

    var guildSelect = document.getElementById('guildSelect');
    var channelSelect = document.getElementById('channelSelect');
    var channelHint = document.getElementById('channelHint');
    var mentionCheckbox = document.getElementById('mentionEveryone');
    var msgStart = document.getElementById('msgStart');
    var msgHourly = document.getElementById('msgHourly');
    var msgEnd = document.getElementById('msgEnd');
    var previewText = document.getElementById('previewText');
    var previewBotName = document.getElementById('previewBotName');
    var previewAvatar = document.getElementById('previewAvatar');
    var botAvatar = document.getElementById('botAvatar');
    var botPill = document.getElementById('botPill');
    var botStatusText = document.getElementById('botStatusText');
    var toggleBtn = document.getElementById('toggleBtn');
    var toggleBtnText = document.getElementById('toggleBtnText');
    var saveBtn = document.getElementById('saveBtn');
    var testBtn = document.getElementById('testBtn');
    var statusEl = document.getElementById('status');
    var autoBadge = document.getElementById('autoBadge');
    var agendaList = document.getElementById('agendaList');
    var logsList = document.getElementById('logsList');

    var state = null;
    var formDirty = false;

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function fmtCountdown(ms) {
        if (ms <= 0) return 'agora';
        var total = Math.floor(ms / 1000);
        var d = Math.floor(total / 86400);
        var h = Math.floor((total % 86400) / 3600);
        var m = Math.floor((total % 3600) / 60);
        var s = total % 60;
        if (d > 0) return d + 'd ' + pad2(h) + ':' + pad2(m) + ':' + pad2(s);
        return pad2(h) + ':' + pad2(m) + ':' + pad2(s);
    }

    function showStatus(type, text) {
        statusEl.className = 'status show ' + type;
        statusEl.textContent = text;
    }

    function updatePreview() {
        var text = msgStart.value || 'Hora de jogar, baitolas! O baú vai abrir, bora pro Fortnite 🎮';
        var html = escapeHtml(text);
        if (mentionCheckbox.checked) {
            html = '<span class="mention">@everyone</span>\n' + html;
        }
        previewText.innerHTML = html;
    }

    [mentionCheckbox, msgStart, msgHourly, msgEnd].forEach(function (el) {
        el.addEventListener('input', function () {
            formDirty = true;
            updatePreview();
        });
        el.addEventListener('change', function () {
            formDirty = true;
            updatePreview();
        });
    });

    function populateChannels(guildId, preferredChannelId) {
        var guilds = (state && state.guilds) || [];
        var guild = guilds.find(function (g) { return g.id === guildId; });

        channelSelect.innerHTML = '';
        channelHint.textContent = '';
        channelHint.className = 'field-hint';

        if (!guild) {
            channelSelect.disabled = true;
            channelSelect.innerHTML = '<option value="">Selecione um servidor primeiro</option>';
            return;
        }

        if (!guild.channels.length) {
            channelSelect.disabled = true;
            channelSelect.innerHTML = '<option value="">Nenhum canal de texto disponível</option>';
            return;
        }

        channelSelect.disabled = false;
        guild.channels.forEach(function (ch) {
            var opt = document.createElement('option');
            opt.value = ch.id;
            var label = '#' + ch.name + (ch.category ? ' (' + ch.category + ')' : '');
            if (!ch.can_send) label += ' [sem permissão]';
            opt.textContent = label;
            channelSelect.appendChild(opt);
        });

        if (preferredChannelId && guild.channels.some(function (c) { return c.id === preferredChannelId; })) {
            channelSelect.value = preferredChannelId;
        }
        updateChannelHint();
    }

    function updateChannelHint() {
        var guilds = (state && state.guilds) || [];
        var guild = guilds.find(function (g) { return g.id === guildSelect.value; });
        var ch = guild && guild.channels.find(function (c) { return c.id === channelSelect.value; });
        if (ch && !ch.can_send) {
            channelHint.textContent = 'Atenção: o bot não tem permissão de enviar mensagens neste canal.';
            channelHint.className = 'field-hint warn';
        } else if (ch) {
            channelHint.textContent = 'Os avisos serão enviados em #' + ch.name + '.';
            channelHint.className = 'field-hint';
        } else {
            channelHint.textContent = '';
        }
    }

    guildSelect.addEventListener('change', function () {
        formDirty = true;
        populateChannels(guildSelect.value, null);
    });
    channelSelect.addEventListener('change', function () {
        formDirty = true;
        updateChannelHint();
    });

    function renderToggleButton(enabled) {
        var img = toggleBtn.querySelector('img');
        if (enabled) {
            toggleBtn.className = 'btn btn-danger';
            toggleBtnText.textContent = 'Desativar avisos automáticos';
            if (img) img.src = 'assets/desativado.png';
            autoBadge.textContent = 'Ativo';
            autoBadge.classList.add('on');
        } else {
            toggleBtn.className = 'btn btn-live';
            toggleBtnText.textContent = 'Ativar avisos automáticos';
            if (img) img.src = 'assets/jogar.png';
            autoBadge.textContent = 'Desativado';
            autoBadge.classList.remove('on');
        }
    }

    function renderBotInfo(bot) {
        if (bot.error) {
            botPill.setAttribute('data-state', 'error');
            botStatusText.textContent = bot.error;
            return;
        }
        if (bot.ready) {
            botPill.setAttribute('data-state', 'online');
            var ping = bot.latency_ms !== null ? ' · ' + bot.latency_ms + ' ms' : '';
            botStatusText.textContent = (bot.tag || 'Bot online') + ping;
            if (bot.tag) previewBotName.textContent = bot.tag.split('#')[0];
            if (bot.avatar_url) {
                previewAvatar.src = bot.avatar_url;
                botAvatar.src = bot.avatar_url;
            }
        } else {
            botPill.setAttribute('data-state', 'connecting');
            botStatusText.textContent = 'Conectando ao Discord...';
        }
    }

    function renderAgenda(events) {
        if (!events || !events.length) {
            agendaList.innerHTML = '<div class="empty-msg">Nenhum aviso pendente.</div>';
            return;
        }
        var now = Date.now();
        agendaList.innerHTML = events.map(function (ev) {
            var tipoLabel = ev.tipo === 'start' ? 'Início' : (ev.tipo === 'end' ? 'Fim' : 'Lembrete');
            var texto = tipoLabel + ' - ' + ev.sessao + ' (' + ev.data + ')';
            var cls = ev.sent ? 'agenda-item sent' : 'agenda-item';
            var right = ev.sent ? 'enviado' : fmtCountdown(ev.at_ms - now);
            return '<div class="' + cls + '">' +
                '<span class="dot"></span>' +
                '<span class="agenda-time">' + escapeHtml(ev.hora) + '</span>' +
                '<span class="agenda-label">' + escapeHtml(texto) + '</span>' +
                '<span class="agenda-countdown">' + escapeHtml(right) + '</span>' +
                '</div>';
        }).join('');
    }

    function renderLogs(logs) {
        if (!logs || !logs.length) {
            logsList.innerHTML = '<div class="empty-msg">Nenhum evento registrado ainda.</div>';
            return;
        }
        logsList.innerHTML = logs.slice(0, 10).map(function (item) {
            return '<div class="log-item ' + escapeHtml(item.level || 'info') + '">' +
                '<span class="log-meta">' + escapeHtml(item.time || '') + '</span>' +
                '<span class="log-text">' + escapeHtml(item.text || '') + '</span>' +
                '</div>';
        }).join('');
    }

    function applyState(newState, forceForm) {
        state = newState;
        renderBotInfo(state.bot);
        renderToggleButton(state.config.enabled);
        renderAgenda(state.events);
        renderLogs(state.logs);

        var guilds = state.guilds || [];
        var needsGuildPopulate = forceForm || !formDirty || (guildSelect.disabled && guilds.length > 0);
        if (needsGuildPopulate) {
            var prevGuild = guildSelect.value;
            guildSelect.innerHTML = '';

            if (!guilds.length) {
                var opt = document.createElement('option');
                opt.value = '';
                opt.textContent = state.bot.ready ? 'Bot não está em nenhum servidor' : 'Aguardando conexão...';
                guildSelect.appendChild(opt);
                guildSelect.disabled = true;
                populateChannels('', null);
            } else {
                guildSelect.disabled = false;
                guilds.forEach(function (g) {
                    var o = document.createElement('option');
                    o.value = g.id;
                    o.textContent = g.name;
                    guildSelect.appendChild(o);
                });
                var targetGuild = state.config.guild_id || prevGuild;
                if (targetGuild && guilds.some(function (g) { return g.id === targetGuild; })) {
                    guildSelect.value = targetGuild;
                }
                populateChannels(guildSelect.value, state.config.channel_id);
            }
        }

        if (forceForm || !formDirty) {
            mentionCheckbox.checked = Boolean(state.config.mention_everyone);
            msgStart.value = state.config.messages.start || '';
            msgHourly.value = state.config.messages.hourly || '';
            msgEnd.value = state.config.messages.end || '';
            updatePreview();
        }
    }

    function collectConfig(enabledOverride) {
        return {
            guild_id: guildSelect.value || null,
            channel_id: channelSelect.value || null,
            enabled: typeof enabledOverride === 'boolean' ? enabledOverride : Boolean(state && state.config.enabled),
            mention_everyone: mentionCheckbox.checked,
            messages: {
                start: msgStart.value.trim(),
                hourly: msgHourly.value.trim(),
                end: msgEnd.value.trim()
            }
        };
    }

    async function saveConfig(enabledOverride) {
        var payload = collectConfig(enabledOverride);
        var res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        var data = await res.json();
        if (data.state) {
            formDirty = false;
            applyState(data.state, true);
        }
        if (!res.ok || !data.ok) {
            showStatus('error', data.error || 'Erro ao salvar configurações.');
            return false;
        }
        return true;
    }

    toggleBtn.addEventListener('click', async function () {
        var nextEnabled = !(state && state.config.enabled);
        toggleBtn.disabled = true;
        try {
            var ok = await saveConfig(nextEnabled);
            if (ok) {
                showStatus(
                    nextEnabled ? 'success' : 'info',
                    nextEnabled
                        ? 'Avisos automáticos ativados para o canal selecionado!'
                        : 'Avisos automáticos desativados.'
                );
            }
        } catch (err) {
            showStatus('error', 'Falha de comunicação com o servidor do bot.');
        } finally {
            toggleBtn.disabled = false;
        }
    });

    saveBtn.addEventListener('click', async function () {
        saveBtn.disabled = true;
        try {
            var ok = await saveConfig();
            if (ok) showStatus('success', 'Configurações e mensagens salvas.');
        } catch (err) {
            showStatus('error', 'Falha de comunicação com o servidor do bot.');
        } finally {
            saveBtn.disabled = false;
        }
    });

    testBtn.addEventListener('click', async function () {
        if (!channelSelect.value) {
            showStatus('error', 'Selecione um servidor e um canal primeiro.');
            return;
        }
        testBtn.disabled = true;
        showStatus('info', 'Enviando mensagem de teste...');
        try {
            var res = await fetch('/api/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel_id: channelSelect.value,
                    mention_everyone: false
                })
            });
            var data = await res.json();
            if (data.state) applyState(data.state, false);
            if (res.ok && data.ok) {
                showStatus('success', 'Mensagem de teste enviada! Confere no Discord.');
            } else {
                showStatus('error', data.error || 'Não foi possível enviar a mensagem de teste.');
            }
        } catch (err) {
            showStatus('error', 'Falha ao falar com o servidor local.');
        } finally {
            testBtn.disabled = false;
        }
    });

    async function pollState() {
        try {
            var res = await fetch('/api/state', { cache: 'no-store' });
            if (!res.ok) return;
            var data = await res.json();
            applyState(data, false);
        } catch (err) {}
    }

    pollState();
    setInterval(pollState, 3000);
    setInterval(function () {
        if (state && state.events) renderAgenda(state.events);
    }, 1000);
})();
