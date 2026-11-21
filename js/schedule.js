(function (global) {
    'use strict';

    var OFFSET_MS = -4 * 60 * 60 * 1000; // America/Manaus (UTC-4), sem horário de verão
    var MESES_PT = [
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function getParintinsParts(date) {
        var d = new Date(date.getTime() + OFFSET_MS);
        return {
            year: d.getUTCFullYear(),
            month: d.getUTCMonth(),
            date: d.getUTCDate(),
            day: d.getUTCDay()
        };
    }

    function getSessionsForSaturday(y, m, d) {
        var sabUtcRef = new Date(Date.UTC(y, m, d));
        var sy = sabUtcRef.getUTCFullYear();
        var sm = sabUtcRef.getUTCMonth();
        var sd = sabUtcRef.getUTCDate();
        var domUtcRef = new Date(Date.UTC(sy, sm, sd + 1));

        var ddmmSab = pad2(sd) + '/' + pad2(sm + 1);
        var ddmmDom = pad2(domUtcRef.getUTCDate()) + '/' + pad2(domUtcRef.getUTCMonth() + 1);
        var sabKey = sy + '-' + pad2(sm + 1) + '-' + pad2(sd);

        return {
            sabado: {
                year: sy,
                month: sm,
                date: sd,
                iso: sabKey,
                ddmm: ddmmSab,
                dataExtenso: sd + ' de ' + MESES_PT[sm] + ' de ' + sy
            },
            sessoes: [
                {
                    id: 'session1',
                    keyPrefix: sabKey + '_s0',
                    nome: 'primeira sessão',
                    inicio: new Date(Date.UTC(sy, sm, sd, 19, 0, 0)), // 15:00 UTC-4
                    fim: new Date(Date.UTC(sy, sm, sd, 21, 0, 0)),    // 17:00 UTC-4
                    rotuloInicio: '15:00',
                    rotuloFim: '17:00',
                    dataInicio: ddmmSab,
                    dataFim: ddmmSab
                },
                {
                    id: 'session2',
                    keyPrefix: sabKey + '_s1',
                    nome: 'segunda sessão',
                    inicio: new Date(Date.UTC(sy, sm, sd + 1, 2, 0, 0)), // 22:00 UTC-4 de sábado
                    fim: new Date(Date.UTC(sy, sm, sd + 1, 4, 0, 0)),    // 00:00 UTC-4 de domingo
                    rotuloInicio: '22:00',
                    rotuloFim: '00:00',
                    dataInicio: ddmmSab,
                    dataFim: ddmmDom
                }
            ]
        };
    }

    function getSessoesDaSemana(agora) {
        var ref = agora instanceof Date ? agora : new Date();
        var p = getParintinsParts(ref);
        var diffSabado = (6 - p.day + 7) % 7;
        var res = getSessionsForSaturday(p.year, p.month, p.date + diffSabado);
        res.sabado.isHoje = diffSabado === 0;
        return res;
    }

    function getActiveAndUpcomingSessions(nowMs) {
        var dLocal = new Date(nowMs + OFFSET_MS);
        var diffSabado = (6 - dLocal.getUTCDay() + 7) % 7;
        var nextSab = new Date(Date.UTC(dLocal.getUTCFullYear(), dLocal.getUTCMonth(), dLocal.getUTCDate() + diffSabado));
        var prevSab = new Date(Date.UTC(nextSab.getUTCFullYear(), nextSab.getUTCMonth(), nextSab.getUTCDate() - 7));

        return getSessionsForSaturday(prevSab.getUTCFullYear(), prevSab.getUTCMonth(), prevSab.getUTCDate()).sessoes
            .concat(getSessionsForSaturday(nextSab.getUTCFullYear(), nextSab.getUTCMonth(), nextSab.getUTCDate()).sessoes);
    }

    global.BauSchedule = {
        OFFSET_MS: OFFSET_MS,
        MESES_PT: MESES_PT,
        pad2: pad2,
        getParintinsParts: getParintinsParts,
        getSessionsForSaturday: getSessionsForSaturday,
        getSessoesDaSemana: getSessoesDaSemana,
        getActiveAndUpcomingSessions: getActiveAndUpcomingSessions
    };
})(window);
