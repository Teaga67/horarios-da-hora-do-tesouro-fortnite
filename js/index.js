(function () {
    'use strict';

    // PARALLAX
    (function initParallax() {
        var layer = document.getElementById('parallaxLayer');
        if (!layer) return;
        var img = new Image();
        img.onerror = function () { layer.classList.add('no-image'); };
        img.src = 'assets/background.jpg';
        var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (prefersReduced || isMobile) return;
        var ticking = false;
        function update() {
            var y = window.scrollY || window.pageYOffset;
            var offset = Math.min(y * 0.15, window.innerHeight * 0.5);
            layer.style.transform = 'translate3d(0, ' + (-offset) + 'px, 0)';
            ticking = false;
        }
        window.addEventListener('scroll', function () {
            if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
        }, { passive: true });
        update();
    })();

    // IMAGENS OPCIONAIS
    var probe = new Image();
    probe.onload = function () {
        var f = document.getElementById('figureCartas');
        if (f) f.classList.remove('hidden');
    };
    probe.src = 'assets/cartas_token_procurado.png';

    // GAVETA
    var drawer = document.getElementById('drawer');
    var drawerOverlay = document.getElementById('drawerOverlay');
    var drawerToggle = document.getElementById('drawerToggle');
    var drawerClose = document.getElementById('drawerClose');
    var drawerToast = document.getElementById('drawerToast');
    var toastTimer = null;
    var lastFocused = null;

    function showToast(msg) {
        if (!drawerToast) return;
        drawerToast.textContent = msg;
        drawerToast.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { drawerToast.classList.remove('show'); }, 2200);
    }

    function openDrawer() {
        lastFocused = document.activeElement;
        drawerOverlay.hidden = false;
        void drawerOverlay.offsetWidth;
        drawer.classList.add('open');
        drawerOverlay.classList.add('open');
        drawer.setAttribute('aria-hidden', 'false');
        drawerToggle.setAttribute('aria-expanded', 'true');
        document.body.classList.add('drawer-open');
        setTimeout(function () { drawerClose.focus(); }, 50);
    }

    function closeDrawer() {
        drawer.classList.remove('open');
        drawerOverlay.classList.remove('open');
        drawer.setAttribute('aria-hidden', 'true');
        drawerToggle.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('drawer-open');
        setTimeout(function () {
            if (!drawer.classList.contains('open')) drawerOverlay.hidden = true;
        }, 260);
        if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    }

    drawerToggle.addEventListener('click', function () {
        if (drawer.classList.contains('open')) closeDrawer(); else openDrawer();
    });
    drawerClose.addEventListener('click', closeDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
        if (!drawer.classList.contains('open')) return;
        if (e.key === 'Escape') { closeDrawer(); return; }
        if (e.key !== 'Tab') return;
        var focaveis = drawer.querySelectorAll('a[href], button:not([disabled])');
        if (!focaveis.length) return;
        var primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    });
    document.querySelectorAll('[data-drawer-link]').forEach(function (link) {
        link.addEventListener('click', closeDrawer);
    });

        var pad = window.BauSchedule.pad2;
    var getSessoesDaSemana = window.BauSchedule.getSessoesDaSemana;
    var COUNT_API = 'https://countapi.mileshilliard.com/api/v1';

    function countRequest(endpoint) {
        if (typeof fetch !== 'function') return Promise.reject(new Error('no-fetch'));
        return fetch(COUNT_API + endpoint, { mode: 'cors', cache: 'no-store' }).then(function (res) {
            if (res.status === 404) return { value: 0 };
            if (!res.ok) throw new Error('http-' + res.status);
            return res.json();
        });
    }

    function countGet(key) {
        return countRequest('/get/' + encodeURIComponent(key)).then(function (d) {
            var v = Number(d && d.value);
            return isFinite(v) && v >= 0 ? v : 0;
        });
    }

    function countHit(key) {
        return countRequest('/hit/' + encodeURIComponent(key)).then(function (d) {
            var v = Number(d && d.value);
            return isFinite(v) && v >= 0 ? v : 0;
        });
    }

    function countDecrement(key) {
        return countGet(key).then(function (cur) {
            var next = Math.max(0, cur - 1);
            return countRequest('/set/' + encodeURIComponent(key) + '?value=' + next).then(function (d) {
                var v = Number(d && d.value);
                return isFinite(v) && v >= 0 ? v : next;
            });
        });
    }

    function copiarTexto(texto) {
        if (navigator.clipboard && window.isSecureContext && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(texto).catch(function () {
                return copiarViaTextarea(texto);
            });
        }
        return copiarViaTextarea(texto);
    }

    function copiarViaTextarea(texto) {
        return new Promise(function (resolve, reject) {
            try {
                var ta = document.createElement('textarea');
                ta.value = texto;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.top = '-9999px';
                ta.style.left = '-9999px';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                ta.setSelectionRange(0, texto.length);
                var ok = document.execCommand('copy');
                document.body.removeChild(ta);
                if (ok) resolve();
                else reject(new Error('copy-failed'));
            } catch (err) {
                reject(err);
            }
        });
    }

    // ACOES DA GAVETA
    var notifBtn = document.getElementById('notifBtn');
    var notifStatus = document.getElementById('notifStatus');
    notifBtn.addEventListener('click', function () {
        if (!('Notification' in window)) { showToast('Seu navegador não suporta notificações.'); return; }
        if (Notification.permission === 'granted') {
            var enabled = notifBtn.getAttribute('aria-pressed') !== 'true';
            notifBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            notifStatus.textContent = enabled ? 'ligado' : 'desligado';
            showToast(enabled ? 'Notificações ativadas.' : 'Notificações desativadas.');
            return;
        }
        Notification.requestPermission().then(function (perm) {
            if (perm === 'granted') {
                notifBtn.setAttribute('aria-pressed', 'true');
                notifStatus.textContent = 'ligado';
                showToast('Notificações ativadas.');
            } else {
                showToast('Permissão negada.');
            }
        });
    });

    var squadBtn = document.getElementById('squadBtn');
    var squadStatus = document.getElementById('squadStatus');
    var squadTimer = null;
    squadBtn.addEventListener('click', function () {
        var sab = getSessoesDaSemana(new Date()).sabado;
        var url = window.location.protocol === 'file:' ? 'https://teaga67.github.io/horarios-da-hora-do-tesouro-fortnite/' : window.location.href;
        var texto = 'Hora do Tesouro do Fortnite em Parintins (' + sab.ddmm + ', 15h–17h e 22h–00h)! Confere os horários: ' + url;
        var isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

        function confirmarCopia() {
            copiarTexto(texto).then(function () {
                if (squadStatus) {
                    squadStatus.textContent = 'copiado!';
                    if (squadTimer) clearTimeout(squadTimer);
                    squadTimer = setTimeout(function () { squadStatus.textContent = 'compartilhar'; }, 2200);
                }
                showToast('Convite copiado! Cole para o squad.');
            }).catch(function () {
                showToast('Não foi possível copiar o convite.');
            });
        }

        if (isCoarse && navigator.share && window.location.protocol !== 'file:') {
            navigator.share({ title: 'Baú do Fortnite', text: texto, url: url }).catch(function (err) {
                if (!err || err.name !== 'AbortError') confirmarCopia();
            });
        } else {
            confirmarCopia();
        }
    });

    var likeBtn = document.getElementById('likeBtn');
    var likeCountEl = document.getElementById('likeCount');
    var STORAGE_LIKE = 'bau_fortnite_liked';
    var LIKE_KEY = 'teaga67-bau-fortnite-likes';
    var localLiked = false;
    var likeTotal = 0;
    var likeBusy = false;

    try { localLiked = localStorage.getItem(STORAGE_LIKE) === '1'; } catch (e) {}
    if (localLiked) likeTotal = 1;

    function renderLike() {
        likeBtn.setAttribute('aria-pressed', localLiked ? 'true' : 'false');
        likeCountEl.textContent = String(likeTotal);
    }
    renderLike();

    countGet(LIKE_KEY).then(function (val) {
        likeTotal = localLiked ? Math.max(1, val) : val;
        renderLike();
    }).catch(function () {});

    likeBtn.addEventListener('click', function () {
        if (likeBusy) return;
        likeBusy = true;
        localLiked = !localLiked;
        likeTotal = Math.max(0, likeTotal + (localLiked ? 1 : -1));
        renderLike();
        try { localStorage.setItem(STORAGE_LIKE, localLiked ? '1' : '0'); } catch (e) {}
        showToast(localLiked ? 'Valeu pela curtida!' : 'Curtida removida.');

        var op = localLiked ? countHit(LIKE_KEY) : countDecrement(LIKE_KEY);
        op.then(function (val) {
            likeTotal = localLiked ? Math.max(1, val) : val;
            renderLike();
        }).catch(function () {}).then(function () {
            likeBusy = false;
        });
    });

    document.getElementById('playBtn').addEventListener('click', function () {
        showToast('Abrindo o Fortnite...');
        setTimeout(function () { window.open('https://www.fortnite.com/', '_blank', 'noopener'); }, 400);
    });

    document.getElementById('helpBtn').addEventListener('click', function () {
        closeDrawer();
        var ajuda = document.getElementById('como-funciona');
        if (ajuda) ajuda.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast('Veja a seção Como funciona.');
    });

    var checkinBtn = document.getElementById('checkinBtn');
    var checkinStatus = document.getElementById('checkinStatus');
    var checkinBusy = false;
    var checkinSabIso = '';
    var checkinSabDdmm = '';
    var localChecked = false;
    var checkinTotal = 0;

    function getCheckinStorageKey(iso) { return 'bau_fortnite_checkin_' + iso; }
    function getCheckinApiKey(iso) { return 'teaga67-bau-fortnite-checkin-' + iso; }

    function renderCheckin() {
        checkinBtn.setAttribute('aria-pressed', localChecked ? 'true' : 'false');
        checkinBtn.classList.toggle('done', localChecked);
        if (checkinStatus) {
            if (localChecked) {
                checkinStatus.textContent = checkinTotal > 1 ? 'confirmado · ' + checkinTotal : 'confirmado';
            } else {
                checkinStatus.textContent = checkinTotal > 0 ? checkinTotal + ' confirmados' : 'check-in';
            }
        }
    }

    function syncCheckinWeek(sabado) {
        if (checkinSabIso === sabado.iso) return;
        checkinSabIso = sabado.iso;
        checkinSabDdmm = sabado.ddmm;
        localChecked = false;
        try { localChecked = localStorage.getItem(getCheckinStorageKey(checkinSabIso)) === '1'; } catch (e) {}
        checkinTotal = localChecked ? 1 : 0;
        renderCheckin();

        var isoSnapshot = checkinSabIso;
        countGet(getCheckinApiKey(isoSnapshot)).then(function (val) {
            if (checkinSabIso !== isoSnapshot) return;
            checkinTotal = localChecked ? Math.max(1, val) : val;
            renderCheckin();
        }).catch(function () {});
    }

    syncCheckinWeek(getSessoesDaSemana(new Date()).sabado);

    checkinBtn.addEventListener('click', function () {
        if (checkinBusy) return;
        checkinBusy = true;
        var sab = getSessoesDaSemana(new Date()).sabado;
        if (checkinSabIso !== sab.iso) syncCheckinWeek(sab);

        localChecked = !localChecked;
        checkinTotal = Math.max(0, checkinTotal + (localChecked ? 1 : -1));
        renderCheckin();
        try { localStorage.setItem(getCheckinStorageKey(checkinSabIso), localChecked ? '1' : '0'); } catch (e) {}
        showToast(localChecked ? 'Presença marcada para sábado (' + checkinSabDdmm + ')!' : 'Check-in desfeito.');

        var apiKey = getCheckinApiKey(checkinSabIso);
        var isoSnapshot = checkinSabIso;
        var op = localChecked ? countHit(apiKey) : countDecrement(apiKey);
        op.then(function (val) {
            if (checkinSabIso !== isoSnapshot) return;
            checkinTotal = localChecked ? Math.max(1, val) : val;
            renderCheckin();
        }).catch(function () {}).then(function () {
            checkinBusy = false;
        });
    });

    // LIGHTBOX
    var lightbox = document.getElementById('lightbox');
    var lightboxImg = document.getElementById('lightboxImg');
    function openLightbox(src, alt) {
        lightboxImg.src = src;
        lightboxImg.alt = alt || '';
        lightbox.classList.add('open');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }
    function closeLightbox() {
        lightbox.classList.remove('open');
        lightbox.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }
    document.querySelectorAll('[data-zoomable]').forEach(function (el) {
        el.addEventListener('click', function () { openLightbox(el.src, el.alt); });
        el.style.cursor = 'zoom-in';
    });
    document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function (e) { if (e.target === lightbox) closeLightbox(); });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox();
    });

    // BAU (EASTER EGG)
    var bauTrigger = document.getElementById('bauTrigger');
    var bauClickBadge = document.getElementById('bauClickBadge');
    var bauModal = document.getElementById('bauModal');
    var bauModalClose = document.getElementById('bauModalClose');
    var clickCount = 0;
    var REQUIRED_CLICKS = 5;
    var resetTimer = null;
    var bauLastFocused = null;

    function resetBadge() {
        clickCount = 0;
        bauClickBadge.classList.remove('visible');
        bauClickBadge.textContent = '0';
    }
    function openBauModal() {
        bauLastFocused = document.activeElement;
        bauModal.classList.add('open');
        bauModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        bauModalClose.focus();
    }
    function closeBauModal() {
        bauModal.classList.remove('open');
        bauModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        resetBadge();
        if (resetTimer) clearTimeout(resetTimer);
        if (bauLastFocused && typeof bauLastFocused.focus === 'function') bauLastFocused.focus();
    }
    bauTrigger.addEventListener('click', function () {
        clickCount++;
        bauClickBadge.textContent = clickCount;
        bauClickBadge.classList.add('visible');
        bauTrigger.classList.remove('shake');
        void bauTrigger.offsetWidth;
        bauTrigger.classList.add('shake');
        if (navigator.vibrate) navigator.vibrate(30);
        if (resetTimer) clearTimeout(resetTimer);
        resetTimer = setTimeout(resetBadge, 2000);
        if (clickCount >= REQUIRED_CLICKS) openBauModal();
    });
    bauModalClose.addEventListener('click', closeBauModal);
    bauModal.addEventListener('click', function (e) { if (e.target === bauModal) closeBauModal(); });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && bauModal.classList.contains('open')) closeBauModal();
    });

    // TIMER
    var el = {
        timer: document.getElementById('timer'),
        label: document.getElementById('timerLabel'),
        target: document.getElementById('timerTarget'),
        days: document.getElementById('tmDays'),
        hours: document.getElementById('tmHours'),
        minutes: document.getElementById('tmMinutes'),
        seconds: document.getElementById('tmSeconds'),
        headerDot: document.getElementById('headerDot'),
        headerStatus: document.getElementById('headerStatus'),
        bar: document.getElementById('timerBar'),
        heroDate: document.getElementById('heroDate'),
        sessionsTitle: document.getElementById('sessions-title'),
        footerEventDate: document.getElementById('footerEventDate')
    };

    var ultimoSegundo = -1;
    var estadoAnterior = null;
    var ultimoDiaRef = '';

    function atualizarTextosDaSemana(sabado) {
        var chave = sabado.ddmm + '-' + sabado.year + '-' + (sabado.isHoje ? '1' : '0');
        if (chave === ultimoDiaRef) return;
        ultimoDiaRef = chave;

        if (el.heroDate) {
            el.heroDate.textContent = (sabado.isHoje ? 'hoje, ' : 'no próximo sábado, ') + sabado.dataExtenso;
        }
        if (el.sessionsTitle) {
            el.sessionsTitle.textContent = 'Sessões do dia ' + sabado.ddmm;
        }
        if (el.footerEventDate) {
            el.footerEventDate.textContent = 'Fuso America/Manaus, UTC−4. Evento semanal aos sábados (' + sabado.ddmm + '/' + sabado.year + ').';
        }
        syncCheckinWeek(sabado);
    }

    function tickAnim(node) {
        node.classList.remove('tick');
        void node.offsetWidth;
        node.classList.add('tick');
    }

    function setState(state) {
        el.timer.setAttribute('data-state', state);
        var dotClass = 'status-dot';
        if (state === 'live') dotClass += ' live';
        if (state === 'ended') dotClass += ' ended';
        el.headerDot.className = dotClass;
        if (state === 'live') el.headerStatus.textContent = 'Ao vivo';
        else if (state === 'waiting') el.headerStatus.textContent = 'Aguardando';
        else el.headerStatus.textContent = 'Encerrado';
    }

    function atualizar() {
        var agora = new Date();
        var semana = getSessoesDaSemana(agora);
        var sessoes = semana.sessoes;
        atualizarTextosDaSemana(semana.sabado);

        var proxima = null;
        var ativa = null;

        for (var i = 0; i < sessoes.length; i++) {
            var s = sessoes[i];
            if (agora >= s.inicio && agora < s.fim) { ativa = s; break; }
            if (agora < s.inicio && !proxima) proxima = s;
        }

        for (var j = 0; j < sessoes.length; j++) {
            var node = document.getElementById(sessoes[j].id);
            if (node) node.setAttribute('data-active', 'false');
        }

        var alvo, estado;

        if (ativa) {
            alvo = ativa.fim;
            estado = 'live';
            var ativoNode = document.getElementById(ativa.id);
            if (ativoNode) ativoNode.setAttribute('data-active', 'true');
            el.label.textContent = 'Sessão em andamento, termina em';
            el.target.innerHTML = ativa.dataFim + ' às <strong>' + ativa.rotuloFim + '</strong>';
        } else if (proxima) {
            alvo = proxima.inicio;
            estado = 'waiting';
            el.label.textContent = 'Próxima sessão em';
            el.target.innerHTML = proxima.dataInicio + ' às <strong>' + proxima.rotuloInicio + '</strong>';
        } else {
            estado = 'ended';
            el.label.textContent = 'Evento encerrado';
            el.target.innerHTML = 'Sessões de ' + semana.sabado.ddmm + ' concluídas';
            el.days.textContent = el.hours.textContent = el.minutes.textContent = el.seconds.textContent = '00';
            if (el.bar) el.bar.style.width = '0%';
            setState(estado);
            return;
        }

        setState(estado);

        if (estadoAnterior !== null && estadoAnterior !== estado && estado === 'live') {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
        estadoAnterior = estado;

        var total = Math.floor(Math.max(0, alvo.getTime() - agora.getTime()) / 1000);
        if (el.bar) {
            var pct = estado === 'live' ? 100 - (total * 1000 / (ativa.fim - ativa.inicio)) * 100 : 0;
            el.bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
        }
        var dias = Math.min(99, Math.floor(total / 86400));
        el.days.textContent = pad(dias);
        el.hours.textContent = pad(Math.floor((total % 86400) / 3600));
        el.minutes.textContent = pad(Math.floor((total % 3600) / 60));
        var seg = total % 60;
        if (seg !== ultimoSegundo) {
            el.seconds.textContent = pad(seg);
            tickAnim(el.seconds);
            ultimoSegundo = seg;
        }
    }

    atualizar();
    setInterval(atualizar, 1000);
})();
