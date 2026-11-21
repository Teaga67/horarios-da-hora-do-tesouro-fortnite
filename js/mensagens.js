(function () {
    'use strict';

    var sendMode = document.getElementById('sendMode');
    var channelTargetBox = document.getElementById('channelTargetBox');
    var manualWebhookBox = document.getElementById('manualWebhookBox');
    var webhookProfileBox = document.getElementById('webhookProfileBox');
    var guildSelect = document.getElementById('guildSelect');
    var channelSelect = document.getElementById('channelSelect');
    var channelHint = document.getElementById('channelHint');
    var webhookUrlInput = document.getElementById('webhookUrlInput');
    var webhookNameInput = document.getElementById('webhookNameInput');
    var webhookAvatarInput = document.getElementById('webhookAvatarInput');
    var roleSelect = document.getElementById('roleSelect');
    var insertRoleBtn = document.getElementById('insertRoleBtn');
    var memberSelect = document.getElementById('memberSelect');
    var insertMemberBtn = document.getElementById('insertMemberBtn');
    var manualUserId = document.getElementById('manualUserId');
    var resolveUserBtn = document.getElementById('resolveUserBtn');
    var memberHint = document.getElementById('memberHint');
    var messageContent = document.getElementById('messageContent');
    var embedTitle = document.getElementById('embedTitle');
    var embedDesc = document.getElementById('embedDesc');
    var embedColor = document.getElementById('embedColor');
    var previewAuthorName = document.getElementById('previewAuthorName');
    var previewBadge = document.getElementById('previewBadge');
    var previewAvatar = document.getElementById('previewAvatar');
    var previewText = document.getElementById('previewText');
    var previewEmbed = document.getElementById('previewEmbed');
    var previewEmbedTitle = document.getElementById('previewEmbedTitle');
    var previewEmbedDesc = document.getElementById('previewEmbedDesc');
    var sendCustomBtn = document.getElementById('sendCustomBtn');
    var statusEl = document.getElementById('status');
    var botPill = document.getElementById('botPill');
    var botStatusText = document.getElementById('botStatusText');
    var botAvatar = document.getElementById('botAvatar');
    var guildsList = document.getElementById('guildsList');
    var guildsCountBadge = document.getElementById('guildsCountBadge');
    var logsList = document.getElementById('logsList');

    var state = null;
    var roleMap = {};
    var memberMap = {};
    var loadedGuildTargetsId = '';
    var pendingLeaveId = null;
    var pendingLeaveTimer = null;

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function showStatus(type, text) {
        statusEl.className = 'status show ' + type;
        statusEl.textContent = text;
    }

    function insertAtCursor(snippet) {
        var el = messageContent;
        var start = el.selectionStart != null ? el.selectionStart : el.value.length;
        var end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
        var before = el.value.slice(0, start);
        var after = el.value.slice(end);
        var prefix = before && !/\s$/.test(before) ? ' ' : '';
        el.value = before + prefix + snippet + after;
        var pos = before.length + prefix.length + snippet.length;
        el.focus();
        if (el.setSelectionRange) el.setSelectionRange(pos, pos);
        updatePreview();
    }

    function formatPreviewContent(raw) {
        var escaped = escapeHtml(raw || '');
        escaped = escaped.replace(/@everyone|@here/g, function (m) {
            return '<span class="mention">' + m + '</span>';
        });
        escaped = escaped.replace(/&lt;@&amp;(\d+)&gt;/g, function (_, id) {
            var name = roleMap[id] ? '@' + escapeHtml(roleMap[id].name) : '@cargo(' + id + ')';
            return '<span class="mention">' + name + '</span>';
        });
        escaped = escaped.replace(/&lt;@!?(\d+)&gt;/g, function (_, id) {
            var name = memberMap[id] ? '@' + escapeHtml(memberMap[id].display_name) : '@usuario(' + id + ')';
            return '<span class="mention">' + name + '</span>';
        });
        return escaped;
    }

    function updatePreview() {
        var mode = sendMode.value;
        var botName = (state && state.bot && state.bot.tag) ? state.bot.tag.split('#')[0] : 'Alya Bot';
        var botPic = (state && state.bot && state.bot.avatar_url) ? state.bot.avatar_url : 'assets/icone_alya.jpg';

        if (mode === 'bot') {
            previewAuthorName.textContent = botName;
            previewBadge.textContent = 'BOT';
            previewAvatar.src = botPic;
        } else {
            previewAuthorName.textContent = webhookNameInput.value.trim() || 'Alya Bot Webhook';
            previewBadge.textContent = 'WEBHOOK';
            previewAvatar.src = webhookAvatarInput.value.trim() || botPic;
        }

        previewText.innerHTML = formatPreviewContent(messageContent.value) || '<span style="opacity:0.45;">(sem texto)</span>';

        var t = embedTitle.value.trim();
        var d = embedDesc.value.trim();
        if (t || d) {
            previewEmbed.style.display = '';
            previewEmbed.style.borderLeftColor = embedColor.value || '#FFC93C';
            previewEmbedTitle.textContent = t;
            previewEmbedTitle.style.display = t ? '' : 'none';
            previewEmbedDesc.textContent = d;
            previewEmbedDesc.style.display = d ? '' : 'none';
        } else {
            previewEmbed.style.display = 'none';
        }
    }

    function syncModeUI() {
        var mode = sendMode.value;
        channelTargetBox.style.display = mode === 'webhook_url' ? 'none' : '';
        manualWebhookBox.style.display = mode === 'webhook_url' ? '' : 'none';
        webhookProfileBox.style.display = mode === 'bot' ? 'none' : '';
        updateChannelHint();
        updatePreview();
    }

    sendMode.addEventListener('change', syncModeUI);
    [webhookNameInput, webhookAvatarInput, messageContent, embedTitle, embedDesc, embedColor].forEach(function (el) {
        el.addEventListener('input', updatePreview);
    });

    document.querySelectorAll('.chip-btn[data-insert]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            insertAtCursor(btn.getAttribute('data-insert'));
        });
    });

    function populateChannels(guildId) {
        var guilds = (state && state.guilds) || [];
        var guild = guilds.find(function (g) { return g.id === guildId; });
        var prev = channelSelect.value;

        channelSelect.innerHTML = '';
        if (!guild || !guild.channels.length) {
            channelSelect.disabled = true;
            channelSelect.innerHTML = '<option value="">Nenhum canal disponível</option>';
            updateChannelHint();
            return;
        }

        channelSelect.disabled = false;
        guild.channels.forEach(function (ch) {
            var opt = document.createElement('option');
            opt.value = ch.id;
            var label = '#' + ch.name + (ch.category ? ' (' + ch.category + ')' : '');
            if (!ch.can_send) label += ' [sem envio]';
            else if (!ch.can_webhook) label += ' [sem webhook]';
            opt.textContent = label;
            channelSelect.appendChild(opt);
        });

        if (prev && guild.channels.some(function (c) { return c.id === prev; })) {
            channelSelect.value = prev;
        } else if (state.config && state.config.channel_id && guild.channels.some(function (c) { return c.id === state.config.channel_id; })) {
            channelSelect.value = state.config.channel_id;
        }
        updateChannelHint();
    }

    function updateChannelHint() {
        if (sendMode.value === 'webhook_url') {
            channelHint.textContent = '';
            channelHint.className = 'field-hint';
            return;
        }
        var guilds = (state && state.guilds) || [];
        var guild = guilds.find(function (g) { return g.id === guildSelect.value; });
        var ch = guild && guild.channels.find(function (c) { return c.id === channelSelect.value; });
        if (!ch) {
            channelHint.textContent = '';
            channelHint.className = 'field-hint';
            return;
        }
        if (sendMode.value === 'channel_webhook' && !ch.can_webhook) {
            channelHint.textContent = 'Aviso: o bot não tem permissão "Gerenciar Webhooks" em #' + ch.name + '. Dê a permissão ou mude para "Enviar diretamente como Bot".';
            channelHint.className = 'field-hint warn';
        } else if (sendMode.value === 'bot' && !ch.can_send) {
            channelHint.textContent = 'Aviso: o bot não tem permissão para enviar mensagens em #' + ch.name + '.';
            channelHint.className = 'field-hint warn';
        } else {
            channelHint.textContent = 'Destino: #' + ch.name + ' em ' + guild.name + '.';
            channelHint.className = 'field-hint';
        }
    }

    async function loadGuildTargets(guildId) {
        if (!guildId) {
            roleSelect.innerHTML = '<option value="">Selecione um servidor</option>';
            roleSelect.disabled = true;
            insertRoleBtn.disabled = true;
            memberSelect.innerHTML = '<option value="">Selecione um servidor</option>';
            memberSelect.disabled = true;
            insertMemberBtn.disabled = true;
            memberHint.textContent = '';
            return;
        }
        loadedGuildTargetsId = guildId;
        roleSelect.innerHTML = '<option value="">Carregando cargos...</option>';
        roleSelect.disabled = true;
        insertRoleBtn.disabled = true;
        memberSelect.innerHTML = '<option value="">Carregando pessoas...</option>';
        memberSelect.disabled = true;
        insertMemberBtn.disabled = true;

        try {
            var res = await fetch('/api/guilds/' + encodeURIComponent(guildId) + '/targets', { cache: 'no-store' });
            var data = await res.json();
            if (!res.ok || !data.ok) return;

            roleMap = {};
            roleSelect.innerHTML = '';
            if (data.roles && data.roles.length) {
                roleSelect.disabled = false;
                insertRoleBtn.disabled = false;
                data.roles.forEach(function (r) {
                    roleMap[r.id] = r;
                    var opt = document.createElement('option');
                    opt.value = r.id;
                    opt.textContent = '@' + r.name;
                    roleSelect.appendChild(opt);
                });
            } else {
                roleSelect.innerHTML = '<option value="">Nenhum cargo encontrado</option>';
            }

            memberSelect.innerHTML = '';
            if (data.members_available && data.members && data.members.length) {
                memberSelect.disabled = false;
                insertMemberBtn.disabled = false;
                data.members.forEach(function (m) {
                    memberMap[m.id] = m;
                    var opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = m.display_name + ' (@' + m.name + ')' + (m.bot ? ' [BOT]' : '');
                    memberSelect.appendChild(opt);
                });
                memberHint.textContent = data.members.length + ' membro(s) carregado(s). Você também pode mencionar por ID acima.';
            } else if (!data.members_available) {
                memberSelect.innerHTML = '<option value="">Ative "Server Members Intent" no Portal do Discord</option>';
                memberHint.textContent = 'Sem "Server Members Intent", use o campo de ID numérico acima para mencionar qualquer pessoa.';
            } else {
                memberSelect.innerHTML = '<option value="">Nenhum membro encontrado</option>';
                memberHint.textContent = '';
            }
            updatePreview();
        } catch (err) {}
    }

    guildSelect.addEventListener('change', function () {
        populateChannels(guildSelect.value);
        loadGuildTargets(guildSelect.value);
    });
    channelSelect.addEventListener('change', updateChannelHint);

    insertRoleBtn.addEventListener('click', function () {
        if (!roleSelect.value) return;
        insertAtCursor('<@&' + roleSelect.value + '> ');
    });

    insertMemberBtn.addEventListener('click', function () {
        if (!memberSelect.value) return;
        insertAtCursor('<@' + memberSelect.value + '> ');
    });

    resolveUserBtn.addEventListener('click', async function () {
        var uid = manualUserId.value.trim().replace(/[<@!>]/g, '');
        if (!/^\d{15,22}$/.test(uid)) {
            showStatus('error', 'Digite um ID numérico válido de usuário do Discord.');
            manualUserId.focus();
            return;
        }
        resolveUserBtn.disabled = true;
        try {
            var res = await fetch('/api/resolve-user/' + encodeURIComponent(uid));
            var data = await res.json();
            if (res.ok && data.ok && data.user) {
                memberMap[data.user.id] = data.user;
                insertAtCursor('<@' + data.user.id + '> ');
                manualUserId.value = '';
                showStatus('success', 'Menção adicionada para ' + data.user.display_name + '.');
            } else {
                insertAtCursor('<@' + uid + '> ');
                showStatus('info', data.error || 'Menção <@' + uid + '> inserida pelo ID.');
            }
        } catch (err) {
            insertAtCursor('<@' + uid + '> ');
        } finally {
            resolveUserBtn.disabled = false;
        }
    });

    sendCustomBtn.addEventListener('click', async function () {
        var mode = sendMode.value;
        var payload = {
            mode: mode,
            channel_id: channelSelect.value || '',
            webhook_url: webhookUrlInput.value.trim(),
            webhook_name: webhookNameInput.value.trim(),
            webhook_avatar: webhookAvatarInput.value.trim(),
            content: messageContent.value.trim(),
            embed: (embedTitle.value.trim() || embedDesc.value.trim()) ? {
                title: embedTitle.value.trim(),
                description: embedDesc.value.trim(),
                color: embedColor.value
            } : null
        };

        if (!payload.content && !payload.embed) {
            showStatus('error', 'Escreva um texto ou preencha o embed antes de enviar.');
            messageContent.focus();
            return;
        }
        if (mode !== 'webhook_url' && !payload.channel_id) {
            showStatus('error', 'Selecione um servidor e um canal primeiro.');
            return;
        }
        if (mode === 'webhook_url' && !payload.webhook_url) {
            showStatus('error', 'Cole a URL do webhook antes de enviar.');
            webhookUrlInput.focus();
            return;
        }

        sendCustomBtn.disabled = true;
        showStatus('info', 'Enviando para o Discord...');
        try {
            var res = await fetch('/api/send-custom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            var data = await res.json();
            if (data.state) applyState(data.state);
            if (res.ok && data.ok) {
                showStatus('success', 'Mensagem enviada com sucesso no Discord!');
            } else {
                showStatus('error', data.error || 'Falha ao enviar.');
            }
        } catch (err) {
            showStatus('error', 'Erro de conexão com o servidor local do bot.');
        } finally {
            sendCustomBtn.disabled = false;
        }
    });

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
            if (bot.avatar_url) botAvatar.src = bot.avatar_url;
        } else {
            botPill.setAttribute('data-state', 'connecting');
            botStatusText.textContent = 'Conectando ao Discord...';
        }
    }

    function renderGuildsManager(guilds) {
        guildsCountBadge.textContent = String(guilds.length);
        if (!guilds.length) {
            guildsList.innerHTML = '<div class="empty-msg">O bot não está em nenhum servidor no momento.</div>';
            return;
        }
        guildsList.innerHTML = '';
        guilds.forEach(function (g) {
            var row = document.createElement('div');
            row.className = 'guild-item';

            var iconEl;
            if (g.icon_url) {
                iconEl = document.createElement('img');
                iconEl.className = 'guild-icon';
                iconEl.src = g.icon_url;
                iconEl.alt = '';
            } else {
                iconEl = document.createElement('div');
                iconEl.className = 'guild-icon';
                iconEl.textContent = (g.name || '?').slice(0, 2).toUpperCase();
            }

            var info = document.createElement('div');
            info.className = 'guild-info';
            var nameEl = document.createElement('div');
            nameEl.className = 'guild-name';
            nameEl.textContent = g.name;
            var metaEl = document.createElement('div');
            metaEl.className = 'guild-meta';
            metaEl.textContent = (g.member_count != null ? g.member_count + ' membros · ' : '') + 'ID ' + g.id;
            info.appendChild(nameEl);
            info.appendChild(metaEl);

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-leave';
            var confirming = pendingLeaveId === g.id;
            btn.textContent = confirming ? 'Confirmar saída?' : 'Sair';
            btn.addEventListener('click', function () {
                handleLeaveGuild(g, btn);
            });

            row.appendChild(iconEl);
            row.appendChild(info);
            row.appendChild(btn);
            guildsList.appendChild(row);
        });
    }

    async function handleLeaveGuild(guild, btn) {
        if (pendingLeaveId !== guild.id) {
            pendingLeaveId = guild.id;
            if (pendingLeaveTimer) clearTimeout(pendingLeaveTimer);
            pendingLeaveTimer = setTimeout(function () {
                pendingLeaveId = null;
                if (state) renderGuildsManager(state.guilds || []);
            }, 4000);
            renderGuildsManager(state.guilds || []);
            showStatus('info', 'Clique em "Confirmar saída?" novamente para remover o bot de "' + guild.name + '".');
            return;
        }

        pendingLeaveId = null;
        if (pendingLeaveTimer) clearTimeout(pendingLeaveTimer);
        btn.disabled = true;
        btn.textContent = 'Saindo...';
        try {
            var res = await fetch('/api/guilds/' + encodeURIComponent(guild.id) + '/leave', {
                method: 'POST'
            });
            var data = await res.json();
            if (data.state) applyState(data.state);
            if (res.ok && data.ok) {
                showStatus('success', 'O bot saiu do servidor "' + guild.name + '".');
            } else {
                showStatus('error', data.error || 'Não foi possível sair do servidor.');
            }
        } catch (err) {
            showStatus('error', 'Falha ao comunicar com o servidor local.');
        }
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

    function applyState(newState) {
        state = newState;
        renderBotInfo(state.bot);
        renderGuildsManager(state.guilds || []);
        renderLogs(state.logs || []);

        var guilds = state.guilds || [];
        var currentGuildId = guildSelect.value;
        var hasMatchingGuild = guilds.some(function (g) { return g.id === currentGuildId; });

        if (!hasMatchingGuild || guildSelect.disabled) {
            guildSelect.innerHTML = '';
            if (!guilds.length) {
                guildSelect.disabled = true;
                guildSelect.innerHTML = '<option value="">' + (state.bot.ready ? 'Bot sem servidores' : 'Aguardando conexão...') + '</option>';
                populateChannels('');
                loadGuildTargets('');
            } else {
                guildSelect.disabled = false;
                guilds.forEach(function (g) {
                    var o = document.createElement('option');
                    o.value = g.id;
                    o.textContent = g.name;
                    guildSelect.appendChild(o);
                });
                var preferred = (state.config && state.config.guild_id && guilds.some(function (g) { return g.id === state.config.guild_id; }))
                    ? state.config.guild_id
                    : guilds[0].id;
                guildSelect.value = preferred;
                populateChannels(preferred);
                if (loadedGuildTargetsId !== preferred) {
                    loadGuildTargets(preferred);
                }
            }
        }
        updatePreview();
    }

    async function pollState() {
        try {
            var res = await fetch('/api/state', { cache: 'no-store' });
            if (!res.ok) return;
            var data = await res.json();
            applyState(data);
        } catch (err) {}
    }

    syncModeUI();
    pollState();
    setInterval(pollState, 4000);
})();
