(function () {
    'use strict';

    var pad = window.BauSchedule.pad2;
    var getSessoesDaSemana = window.BauSchedule.getSessoesDaSemana;

    var params = new URLSearchParams(window.location.search);
    var estilo = params.get('estilo');
    if (estilo === 'pill' || estilo === 'card') {
        document.body.setAttribute('data-style', estilo);
    }

    var pos = params.get('pos');
    if (pos === 'center' || pos === 'top-left' || pos === 'top-right' || pos === 'bottom-left' || pos === 'bottom-right') {
        document.body.setAttribute('data-pos', pos);
    }

    var bgParam = params.get('bg');
    if (bgParam !== null) {
        var bgNum = Number(bgParam);
        if (isFinite(bgNum)) {
            var alpha = Math.max(0, Math.min(100, bgNum)) / 100;
            document.documentElement.style.setProperty('--panel-alpha', String(alpha));
            if (alpha === 0) {
                var w = document.getElementById('timer');
                if (w) {
                    w.style.borderColor = 'transparent';
                    w.style.boxShadow = 'none';
                }
            }
        }
    }

    var scaleParam = params.get('escala');
    if (scaleParam !== null) {
        var scaleNum = Number(scaleParam);
        if (isFinite(scaleNum) && scaleNum >= 0.5 && scaleNum <= 2.5) {
            document.documentElement.style.setProperty('--scale', String(scaleNum));
        }
    }

    var forceDias = params.get('dias') === '1';

    var el = {
        timer: document.getElementById('timer'),
        label: document.getElementById('timerLabel'),
        target: document.getElementById('timerTarget'),
        wrapDays: document.getElementById('wrapDays'),
        days: document.getElementById('tmDays'),
        hours: document.getElementById('tmHours'),
        minutes: document.getElementById('tmMinutes'),
        seconds: document.getElementById('tmSeconds'),
        bar: document.getElementById('timerBar')
    };

    function atualizar() {
        var agora = new Date();
        var semana = getSessoesDaSemana(agora);
        var sessoes = semana.sessoes;
        var proxima = null;
        var ativa = null;

        for (var i = 0; i < sessoes.length; i++) {
            var s = sessoes[i];
            if (agora >= s.inicio && agora < s.fim) { ativa = s; break; }
            if (agora < s.inicio && !proxima) proxima = s;
        }

        var alvo, estado;

        if (ativa) {
            alvo = ativa.fim;
            estado = 'live';
            el.label.textContent = 'Hora do Tesouro ativo';
            el.target.innerHTML = 'até <strong>' + ativa.rotuloFim + '</strong>';
        } else if (proxima) {
            alvo = proxima.inicio;
            estado = 'waiting';
            el.label.textContent = 'Hora do Tesouro em';
            el.target.innerHTML = proxima.dataInicio + ' · <strong>' + proxima.rotuloInicio + '</strong>';
        } else {
            estado = 'ended';
            el.label.textContent = 'Encerrado';
            el.target.textContent = semana.sabado.ddmm;
            el.days.textContent = el.hours.textContent = el.minutes.textContent = el.seconds.textContent = '00';
            if (el.bar) el.bar.style.width = '0%';
            el.timer.setAttribute('data-state', estado);
            return;
        }

        el.timer.setAttribute('data-state', estado);

        var total = Math.floor(Math.max(0, alvo.getTime() - agora.getTime()) / 1000);
        if (el.bar) {
            var pct = estado === 'live' ? 100 - (total * 1000 / (ativa.fim - ativa.inicio)) * 100 : 0;
            el.bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
        }

        var dias = Math.min(99, Math.floor(total / 86400));
        if (el.wrapDays) {
            el.wrapDays.classList.toggle('is-hidden', !forceDias && dias === 0);
        }
        el.days.textContent = pad(dias);
        el.hours.textContent = pad(Math.floor((total % 86400) / 3600));
        el.minutes.textContent = pad(Math.floor((total % 3600) / 60));
        el.seconds.textContent = pad(total % 60);
    }

    atualizar();
    setInterval(atualizar, 1000);
})();
