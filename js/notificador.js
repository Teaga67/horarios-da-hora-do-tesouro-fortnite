(function () {
    'use strict';

    var STORAGE_WEBHOOK = 'discord_webhook_alya_fortnite';
    var STORAGE_ACTIVE = 'discord_active_alya_fortnite';
    var STORAGE_SENT = 'discord_sent_alya_fortnite';
    var BOT_NAME = 'Alya do Fortnite';
        var OFFSET_MS = window.BauSchedule.OFFSET_MS;
    var getActiveAndUpcomingSessions = window.BauSchedule.getActiveAndUpcomingSessions;

    var webhookInput = document.getElementById('webhook');
    var mentionCheckbox = document.getElementById('mentionEveryone');
    var startBtn = document.getElementById('startBtn');
    var testBtn = document.getElementById('testBtn');
    var stopBtn = document.getElementById('stopBtn');
    var statusEl = document.getElementById('status');
    var previewText = document.getElementById('previewText');
    var agendaEl = document.getElementById('agenda');
    var agendaList = document.getElementById('agendaList');

    var tickInterval = null;

    function loadState() {
        var state = { webhook: '', active: false, sent: {} };
        try {
            state.webhook = localStorage.getItem(STORAGE_WEBHOOK) || '';
            state.active = localStorage.getItem(STORAGE_ACTIVE) === '1';
            var sentRaw = localStorage.getItem(STORAGE_SENT);
            if (sentRaw) state.sent = JSON.parse(sentRaw) || {};
        } catch (e) {}
        return state;
    }
    function saveWebhook(url) {
        try { localStorage.setItem(STORAGE_WEBHOOK, url); } catch (e) {}
    }
    function saveActive(active) {
        try { localStorage.setItem(STORAGE_ACTIVE, active ? '1' : '0'); } catch (e) {}
    }
    function saveSent(sent) {
        try { localStorage.setItem(STORAGE_SENT, JSON.stringify(sent)); } catch (e) {}
    }

    var state = loadState();
    webhookInput.value = state.webhook;

    function showStatus(type, html) {
        statusEl.className = 'status show ' + type;
        statusEl.innerHTML = html;
    }
    function hideStatus() {
        statusEl.className = 'status';
        statusEl.innerHTML = '';
    }
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function updatePreview() {
        var html = '<span class="mention">@everyone</span>\nHora de jogar, baitolas! O baú vai abrir, bora pro Fortnite 🎮';
        if (!mentionCheckbox.checked) {
            html = 'Hora de jogar, baitolas! O baú vai abrir, bora pro Fortnite 🎮';
        }
        previewText.innerHTML = html;
    }
    mentionCheckbox.addEventListener('change', updatePreview);
    updatePreview();

    function isValidWebhook(url) {
        return /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url.trim());
    }

    function fmtTime(d) {
        try {
            return d.toLocaleTimeString('pt-BR', {
                timeZone: 'America/Manaus',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
    }
    function fmtDate(d) {
        var local = new Date(d.getTime() + OFFSET_MS);
        return pad2(local.getUTCDate()) + '/' + pad2(local.getUTCMonth() + 1);
    }
    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    function fmtCountdown(ms) {
        if (ms <= 0) return '00:00:00';
        var total = Math.floor(ms / 1000);
        var d = Math.floor(total / 86400);
        var h = Math.floor((total % 86400) / 3600);
        var m = Math.floor((total % 3600) / 60);
        var s = total % 60;
        if (d > 0) return d + 'd ' + pad2(h) + ':' + pad2(m) + ':' + pad2(s);
        return pad2(h) + ':' + pad2(m) + ':' + pad2(s);
    }

    async function postToDiscord(content) {
        var url = webhookInput.value.trim();
        if (!isValidWebhook(url)) return false;
        try {
            var res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: content,
                    username: BOT_NAME,
                    allowed_mentions: { parse: ['everyone'] }
                })
            });
            return res.ok || res.status === 204;
        } catch (e) {
            return false;
        }
    }

    function buildStartMessage(ev) {
        var base = 'Hora de jogar, baitolas! O baú vai abrir, bora pro Fortnite 🎮';
        if (mentionCheckbox.checked) return '@everyone\n' + base;
        return base;
    }
    function buildEndMessage(ev) {
        var base = 'O baú fechou, baitolas! Fim da ' + ev.nome + '. Valeu squad 🎮';
        if (mentionCheckbox.checked) return '@everyone\n' + base;
        return base;
    }
    function buildHourlyMessage(ev) {
        var base = 'Lembrete: o baú está aberto, baitolas! Bora pro Fortnite 🎮';
        if (mentionCheckbox.checked) return '@everyone\n' + base;
        return base;
    }

    function buildEvents(nowMs) {
        var events = [];
        var sessions = getActiveAndUpcomingSessions(typeof nowMs === 'number' ? nowMs : Date.now());
        sessions.forEach(function (s) {
            events.push({
                key: s.keyPrefix + '_start',
                at: s.inicio.getTime(),
                tipo: 'inicio',
                nome: s.nome,
                data: fmtDate(s.inicio),
                hora: fmtTime(s.inicio)
            });
            events.push({
                key: s.keyPrefix + '_end',
                at: s.fim.getTime(),
                tipo: 'fim',
                nome: s.nome,
                data: fmtDate(s.fim),
                hora: fmtTime(s.fim)
            });
            var cursorMs = Math.floor(s.inicio.getTime() / 3600000) * 3600000 + 3600000;
            var hourIdx = 0;
            while (cursorMs < s.fim.getTime()) {
                var cursorDate = new Date(cursorMs);
                events.push({
                    key: s.keyPrefix + '_hour' + hourIdx,
                    at: cursorMs,
                    tipo: 'hora',
                    nome: s.nome,
                    data: fmtDate(cursorDate),
                    hora: fmtTime(cursorDate)
                });
                hourIdx++;
                cursorMs += 60 * 60 * 1000;
            }
        });
        return events;
    }

    function isIgnored(event, now) {
        return (now - event.at) > (60 * 60 * 1000);
    }

    function renderAgenda() {
        if (!state.active) {
            agendaEl.classList.remove('show');
            return;
        }
        var now = Date.now();
        var events = buildEvents(now).filter(function (ev) {
            return !state.sent[ev.key] && !isIgnored(ev, now);
        });

        if (events.length === 0) {
            agendaEl.classList.add('show');
            agendaList.innerHTML = '<div class="agenda-item"><span class="agenda-label">Nenhum aviso pendente. Todas as sessões já foram avisadas ou estão fora da janela de 1 hora.</span></div>';
            return;
        }

        events.sort(function (a, b) { return a.at - b.at; });

        agendaEl.classList.add('show');
        agendaList.innerHTML = events.map(function (ev) {
            var label;
            if (ev.tipo === 'inicio') label = 'Início - ' + ev.nome;
            else if (ev.tipo === 'fim') label = 'Fim - ' + ev.nome;
            else label = 'Lembrete de hora - ' + ev.nome;
            label += ' (' + ev.data + ')';
            var diff = ev.at - now;
            var countdownText = diff > 0 ? fmtCountdown(diff) : 'enviando...';
            var isPast = diff <= 0;
            var cls = isPast ? 'agenda-item sent' : 'agenda-item pending';
            return '<div class="' + cls + '">' +
                '<span class="agenda-dot"></span>' +
                '<span class="agenda-time">' + ev.hora + '</span>' +
                '<span class="agenda-label">' + escapeHtml(label) + '</span>' +
                '<span class="agenda-countdown">' + countdownText + '</span>' +
                '</div>';
        }).join('');
    }

    function updateCountdowns() {
        if (!state.active) return;
        var now = Date.now();
        var items = agendaList.querySelectorAll('.agenda-item.pending');
        var events = buildEvents(now).filter(function (ev) {
            return !state.sent[ev.key] && !isIgnored(ev, now);
        }).sort(function (a, b) { return a.at - b.at; });

        items.forEach(function (item, i) {
            var ev = events[i];
            if (!ev) return;
            var diff = ev.at - now;
            var countdownEl = item.querySelector('.agenda-countdown');
            if (countdownEl) {
                countdownEl.textContent = diff > 0 ? fmtCountdown(diff) : 'enviando...';
                if (diff <= 0) {
                    item.classList.remove('pending');
                    item.classList.add('sent');
                }
            }
        });
    }

    function pruneOldSent(now) {
        var cutoff = now - 14 * 24 * 60 * 60 * 1000;
        Object.keys(state.sent).forEach(function (k) {
            if (typeof state.sent[k] === 'number' && state.sent[k] < cutoff) {
                delete state.sent[k];
            }
        });
    }

    async function fireEvent(ev) {
        if (state.sent[ev.key]) return;
        var now = Date.now();
        state.sent[ev.key] = now;
        pruneOldSent(now);
        saveSent(state.sent);

        var content;
        if (ev.tipo === 'inicio') content = buildStartMessage(ev);
        else if (ev.tipo === 'fim') content = buildEndMessage(ev);
        else content = buildHourlyMessage(ev);

        var ok = await postToDiscord(content);

        if (ok) {
            showStatus('success', '<strong>Aviso enviado.</strong> ' + escapeHtml(ev.nome) + ' (' + ev.data + ') às ' + ev.hora + '.');
        } else {
            showStatus('error', '<strong>Falha ao enviar aviso.</strong> Verifique o webhook. O aviso de ' + ev.hora + ' não será reenviado.');
        }
        renderAgenda();
    }

    function tick() {
        if (!state.active) return;
        var now = Date.now();
        var events = buildEvents(now);

        events.forEach(function (ev) {
            if (state.sent[ev.key]) return;
            if (isIgnored(ev, now)) return;
            if (ev.at <= now) {
                fireEvent(ev);
            }
        });

        updateCountdowns();
    }

    function startTicking() {
        stopTicking();
        tick();
        tickInterval = setInterval(tick, 1000);
    }
    function stopTicking() {
        if (tickInterval) {
            clearInterval(tickInterval);
            tickInterval = null;
        }
    }

    startBtn.addEventListener('click', function () {
        hideStatus();
        var url = webhookInput.value.trim();
        if (!url) {
            showStatus('error', '<strong>Faltou o webhook.</strong> Cole a URL antes de ativar.');
            webhookInput.focus();
            return;
        }
        if (!isValidWebhook(url)) {
            showStatus('error', '<strong>URL inválida.</strong> Ela deve começar com <code>https://discord.com/api/webhooks/</code> e ter o ID e o token.');
            webhookInput.focus();
            return;
        }
        saveWebhook(url);
        state.active = true;
        saveActive(true);
        startBtn.style.display = 'none';
        stopBtn.style.display = '';
        showStatus('success', '<strong>Avisos automáticos ativados.</strong> O bot avisa no início e no fim de cada sessão e a cada hora cheia dentro da sessão. Se um horário já passou há menos de 1 hora, o aviso é enviado agora; se passou mais de 1 hora, é ignorado.');
        startTicking();
        renderAgenda();
    });

    testBtn.addEventListener('click', async function () {
        hideStatus();
        var url = webhookInput.value.trim();
        if (!isValidWebhook(url)) {
            showStatus('error', '<strong>Webhook inválido.</strong> Cole a URL completa do webhook antes de testar.');
            webhookInput.focus();
            return;
        }
        saveWebhook(url);
        testBtn.disabled = true;
        showStatus('info', 'Enviando mensagem de teste...');
        var ok = await postToDiscord('Teste do Alya do Fortnite. Os avisos automáticos estão funcionando.');
        testBtn.disabled = false;
        if (ok) {
            showStatus('success', '<strong>Teste enviado.</strong> Confere lá no canal do Discord.');
        } else {
            showStatus('error', '<strong>Falha no teste.</strong> Verifique se o webhook ainda é válido.');
        }
    });

    stopBtn.addEventListener('click', function () {
        state.active = false;
        saveActive(false);
        stopTicking();
        startBtn.style.display = '';
        stopBtn.style.display = 'none';
        agendaEl.classList.remove('show');
        showStatus('info', 'Avisos automáticos desativados. Os horários já enviados continuam marcados como enviados.');
    });

    if (state.active) {
        startBtn.style.display = 'none';
        stopBtn.style.display = '';
        startTicking();
        renderAgenda();
    }

    setInterval(function () {
        if (state.active) renderAgenda();
    }, 1000);
})();
