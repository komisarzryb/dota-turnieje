'use strict';

const DotaSite = (() => {
  const TEAM_ID = 7119388;
  const TEAM_NAME = 'Team Spirit';
  const OPENDOTA = 'https://api.opendota.com/api';
  const LIQUIPEDIA = 'https://liquipedia.net/dota2/api.php';
  const LIQUI_PAGE = 'Team_Spirit';
  const LIVE_REFRESH_MS = 60000;

  async function fetchJson(url, tries = 3) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Błąd sieci');
  }

  function clean(text) {
    return (text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function absUrl(href) {
    if (!href) return '';
    return /^https?:\/\//.test(href) ? href : 'https://liquipedia.net' + href;
  }

  function teamWon(match) {
    return match.radiant === match.radiant_win;
  }

  function groupMatchesByLeague(matches, leagues, nowTs) {
    const now = nowTs || Date.now() / 1000;
    const buckets = new Map();
    for (const m of matches) {
      const key = m.leagueid || ('x' + (m.league_name || ''));
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(m);
    }
    const out = [];
    for (const [key, list] of buckets) {
      list.sort((a, b) => b.start_time - a.start_time);
      const first = list[list.length - 1];
      const last = list[0];
      const league = leagues ? leagues.get((list[0].leagueid || 0).toString()) : null;
      const winCount = list.filter(teamWon).length;
      const daysSince = (now - last.start_time) / 86400;
      out.push({
        key,
        leagueId: last.leagueid,
        name: clean(last.league_name) || (league && league.name) || 'Nieznany turniej',
        tier: league ? league.tier : null,
        first,
        last,
        wins: winCount,
        losses: list.length - winCount,
        matches: list,
        ongoing: daysSince <= 6,
      });
    }
    out.sort((a, b) => b.last.start_time - a.last.start_time);
    return out;
  }

  function parseLiquipedia(html) {
    const Parser = typeof DOMParser !== 'undefined' ? DOMParser : null;
    if (!html || !Parser) return null;
    const doc = new Parser().parseFromString(html, 'text/html');
    const result = { achievements: [], recentMatches: [], upcoming: [] };

    const heading = doc.querySelector('h2#Results_of_Team_Spirit');
    const tabsRoot = heading && heading.parentElement
      ? heading.parentElement.nextElementSibling
      : null;
    const panels = tabsRoot
      ? [...(tabsRoot.querySelectorAll('[data-tabs-content] > div') || [])]
      : [];

    const achievementsPanel = panels[0];
    if (achievementsPanel) {
      result.achievements = [...achievementsPanel.querySelectorAll('tr.table2__row--body')]
        .map((tr) => {
          const tds = [...tr.querySelectorAll(':scope > td')];
          if (tds.length < 7) return null;
          const dateText = clean(tds[0].textContent);
          const place = clean(tds[1].querySelector('.placement-text')?.textContent) || clean(tds[1].textContent);
          const tier = clean(tds[2].querySelector('a')?.textContent);
          const tournA = tds[4].querySelector('a');
          const resultText = clean(tds[5].textContent) || null;
          const opponent = clean(tds[6].querySelector('.block-team .name')?.textContent) || null;
          const prize = clean(tds[7] && tds[7].textContent) || null;
          return {
            date: dateText,
            place,
            tier,
            tournament: clean(tournA?.textContent) || clean(tds[4].textContent),
            tournamentUrl: absUrl(tournA ? tournA.getAttribute('href') : ''),
            result: resultText,
            opponent,
            prize,
            highlighted: tr.classList.contains('table2__row--highlighted'),
          };
        })
        .filter(Boolean);
      result.achievements.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    }

    const recentPanel = panels[1];
    if (recentPanel) {
      result.recentMatches = [...recentPanel.querySelectorAll('tr.table2__row--body')]
        .map((tr) => {
          const tds = [...tr.querySelectorAll(':scope > td')];
          if (tds.length < 9) return null;
          const timeEl = tds[0].querySelector('.timer-object');
          const ts = timeEl ? Number(timeEl.getAttribute('data-timestamp')) : null;
          const tier = clean(tds[1].querySelector('a')?.textContent);
          const type = clean(tds[2].textContent);
          const tournA = tds[4].querySelector('a');
          const score = clean(tds[6].textContent);
          const opponent = clean(tds[7].querySelector('.block-team .name')?.textContent) || null;
          const vods = [...tds[8].querySelectorAll('a')]
            .map((a) => ({
              href: a.getAttribute('href'),
              label: a.getAttribute('title') || clean(a.textContent) || 'VOD',
            }))
            .filter((v) => /^https?:/.test(v.href) || /youtu|twitch/.test(v.href));
          const details = tds[9] ? tds[9].querySelector('a[href]') : null;
          return {
            ts,
            dateText: timeEl ? null : clean(tds[0].textContent),
            tier,
            type,
            tournament: clean(tournA?.textContent) || clean(tds[4].textContent),
            tournamentUrl: absUrl(tournA ? tournA.getAttribute('href') : ''),
            score,
            win: !!tr.querySelector('.generic-label[data-label-type="result-win"]'),
            loss: !!tr.querySelector('.generic-label[data-label-type="result-loss"]'),
            opponent,
            vods,
            matchUrl: absUrl(details ? details.getAttribute('href') : ''),
            highlighted: tr.classList.contains('table2__row--highlighted'),
          };
        })
        .filter(Boolean);
    }

    const upcomingHeading = [...doc.querySelectorAll('h2, h3')].find(
      (el) => /upcoming matches/i.test(clean(el.textContent))
    );
    if (upcomingHeading) {
      const table = upcomingHeading.parentElement?.nextElementSibling?.querySelector('table');
      if (table) {
        result.upcoming = [...table.querySelectorAll('tr.table2__row--body')]
          .map((tr) => {
            const tds = [...tr.querySelectorAll(':scope > td')];
            if (tds.length < 7) return null;
            const timeEl = tds[0].querySelector('.timer-object');
            const ts = timeEl ? Number(timeEl.getAttribute('data-timestamp')) : null;
            const tournA = tds[4].querySelector('a');
            const opponent = clean(tds[7] && tds[7].querySelector('.block-team .name')?.textContent) || null;
            return {
              ts,
              dateText: timeEl ? null : clean(tds[0].textContent),
              tier: clean(tds[1].querySelector('a')?.textContent),
              type: clean(tds[2].textContent),
              tournament: clean(tournA?.textContent) || clean(tds[4].textContent),
              tournamentUrl: absUrl(tournA ? tournA.getAttribute('href') : ''),
              opponent,
            };
          })
          .filter(Boolean);
      }
    }

    return result;
  }

  function init() {
    const $ = (sel) => document.querySelector(sel);
    const teamLogo = $('#team-logo');
    const teamName = $('#team-name');
    const teamMeta = $('#team-meta');
    const updated = $('#updated');
    const refreshBtn = $('#refresh-btn');
    const statusEl = $('#status');
    const liveContent = $('#live-content');
    const upcomingContent = $('#upcoming-content');
    const resultsContent = $('#results-content');
    const recentContent = $('#recent-content');
    const historyContent = $('#history-content');

    let leagues = new Map();
    let leagueGroups = [];
    let lastRefresh = 0;

    function setStatus(html) {
      statusEl.hidden = !html;
      statusEl.textContent = html || '';
    }

    function noteUpdate() {
      if (updated) {
        updated.hidden = false;
        updated.textContent = 'Zaktualizowano: ' + new Date().toLocaleTimeString('pl-PL');
      }
    }

    function fmtDate(ts) {
      if (!ts) return '';
      return new Date(ts * 1000).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function fmtClock(seconds) {
      const s = Math.max(0, Math.floor(seconds || 0));
      const m = Math.floor(s / 60);
      const leftover = String(s % 60).padStart(2, '0');
      return m + ':' + leftover;
    }

    function el(tag, attrs, children) {
      const node = document.createElement(tag);
      if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
          if (k === 'class') node.className = v;
          else if (k === 'href') node.href = v;
          else if (k === 'target') node.target = v;
          else if (k === 'rel') node.rel = v;
          else if (k === 'hidden') node.hidden = v;
          else if (k === 'title') node.title = v;
          else if (k === 'data-id') node.dataset.id = v;
          else if (v !== undefined && v !== null) node.setAttribute(k, v);
        }
      }
      if (children) {
        for (const child of [].concat(children)) {
          if (child == null) continue;
          node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
        }
      }
      return node;
    }

    function tierChip(tier) {
      if (!tier) return null;
      const pretty = {
        premium: 'Premier',
        professional: 'Zawodowy',
        amateur: 'Amatorski',
        qualifier: 'Kwalifikacje',
        excluded: 'Kwalifikacje',
      }[tier] || tier;
      return el('span', { class: 'chip chip-tier' }, pretty);
    }

    function rankClass(place) {
      const p = clean(place || '');
      if (/^(1|\b1st)/i.test(p) || p === '1') return 'place-1';
      if (/^(2|\b2nd)/i.test(p) || p === '2') return 'place-2';
      if (/^(3|\b3rd)/i.test(p) || p === '3') return 'place-3';
      return 'place-other';
    }

    function renderTeam(team) {
      if (!team) return;
      if (team.logo_url) {
        teamLogo.src = team.logo_url;
        teamLogo.hidden = false;
      }
      teamName.textContent = team.name || TEAM_NAME;
      const total = (team.wins || 0) + (team.losses || 0);
      const wr = total ? Math.round((team.wins / total) * 100) : 0;
      const parts = [];
      if (team.rating) parts.push('Rating: ' + Math.round(team.rating));
      parts.push(team.wins + 'W – ' + team.losses + 'L (' + wr + '%)');
      if (team.tag && team.tag !== (team.name || '')) parts.push('[' + team.tag + ']');
      teamMeta.textContent = parts.filter(Boolean).join('  ·  ');
    }

    function renderLive(matches) {
      const list = (matches || []).filter(
        (g) =>
          g.team_id_radiant === TEAM_ID ||
          g.team_id_dire === TEAM_ID ||
          (g.players || []).some((p) => p.team_id === TEAM_ID) ||
          /spirit/i.test(g.team_name_radiant || '') ||
          /spirit/i.test(g.team_name_dire || '')
      );
      if (!list.length) {
        liveContent.textContent = '';
        liveContent.appendChild(
          el('div', { class: 'empty-note' }, 'Brak meczów Team Spirit na żywo.')
        );
        return;
      }
      liveContent.textContent = '';
      liveContent.appendChild(el('div', { class: 'live-card' }, list.map((g) => {
        const radiant = g.team_id_radiant === TEAM_ID ? TEAM_NAME : (clean(g.team_name_radiant) || 'Radiant');
        const dire = g.team_id_dire === TEAM_ID ? TEAM_NAME : (clean(g.team_name_dire) || 'Dire');
        const league = leagues.get(String(g.league_id || 0));
        const infoBits = [];
        if (league) infoBits.push(league.name);
        infoBits.push(el('span', { class: 'live-time' }, fmtClock(g.game_time)));
        if (g.spectators) infoBits.push('Widzów: ' + g.spectators);
        const twitch = (g.stream || []).length
          ? g.stream.map((s) => el('a', { href: s.embed_url || s.stream_url }, '▶ ' + (s.name || 'stream')))
          : [];
        return el('div', { class: 'live-match' }, [
          el('div', { class: 'live-teams' }, radiant + ' vs ' + dire),
          el('div', { class: 'live-info' }, infoBits),
          twitch.length ? el('span', { class: 'twitch-links' }, twitch) : null,
        ]);
      })));
    }

    function renderUpcoming(upcoming) {
      upcomingContent.textContent = '';
      if (upcoming && upcoming.length) {
        upcomingContent.appendChild(
          el('div', { class: 'row-list' }, upcoming.map((m) =>
            el('div', { class: 'row' }, [
              el('div', { class: 'row-date' }, m.ts ? fmtDate(m.ts) : m.dateText),
              el('span', { class: 'chip chip-tier' }, m.tier || m.type || ''),
              m.tournamentUrl
                ? el('a', { class: 'row-title', href: m.tournamentUrl, target: '_blank', rel: 'noopener' }, m.tournament)
                : el('div', { class: 'row-title' }, m.tournament),
              m.opponent ? el('div', { class: 'row-sub' }, 'vs ' + m.opponent) : null,
            ])
          ))
        );
        return;
      }
      upcomingContent.appendChild(
        el('div', { class: 'empty-note' }, [
          'Brak zaplanowanych meczów Team Spirit. Harmonogram pochodzi z ',
          el('a', { href: 'https://liquipedia.net/dota2/Team_Spirit', target: '_blank', rel: 'noopener' }, 'Liquipedii'),
          ' i pojawi się tu, gdy zostaną ogłoszone kolejne turnieje.',
        ])
      );
    }

    function renderResults(achievements) {
      resultsContent.textContent = '';
      if (!achievements || !achievements.length) {
        if (achievements === null) {
          resultsContent.appendChild(el('div', { class: 'empty-note' }, 'Nie udało się pobrać wyników z Liquipedii.'));
        } else {
          resultsContent.appendChild(el('div', { class: 'empty-note' }, 'Brak wyników.'));
        }
        return;
      }
      resultsContent.appendChild(
        el('div', { class: 'row-list' }, achievements.map((a) =>
          el('div', { class: 'row' + (a.highlighted ? ' highlighted-row' : '') }, [
            el('div', { class: 'row-date' }, a.date),
            el('span', { class: 'place-badge ' + rankClass(a.place) }, a.place || '—'),
            tierChip(a.tier),
            a.tournamentUrl
              ? el('a', { class: 'row-title', href: a.tournamentUrl, target: '_blank', rel: 'noopener' }, a.tournament)
              : el('div', { class: 'row-title' }, a.tournament),
            a.opponent
              ? el('div', { class: 'row-sub' }, (a.result ? a.result + '  ·  ' : '') + 'vs ' + a.opponent)
              : (a.result ? el('div', { class: 'row-sub' }, a.result) : null),
            a.prize ? el('div', { class: 'prize' }, a.prize) : null,
          ])
        ))
      );
    }

    function renderRecent(recent) {
      recentContent.textContent = '';
      if (!recent || !recent.length) {
        recentContent.appendChild(el('div', { class: 'empty-note' }, 'Brak danych o ostatnich meczach.'));
        return;
      }
      recentContent.appendChild(
        el('div', { class: 'row-list' }, recent.map((m) => {
          const rowClass = 'row' + (m.highlighted ? ' highlighted-row' : '');
          const scoreNode = m.loss
            ? el('span', { class: 'score loss' }, 'Porażka  ' + m.score)
            : el('span', { class: 'score win' }, 'Wygrana  ' + m.score);
          return el('div', { class: rowClass }, [
            el('div', { class: 'row-date' }, m.ts ? fmtDate(m.ts) : m.dateText),
            tierChip(m.tier),
            m.tournamentUrl
              ? el('a', { class: 'row-title', href: m.tournamentUrl, target: '_blank', rel: 'noopener' }, m.tournament)
              : el('div', { class: 'row-title' }, m.tournament),
            m.opponent ? el('div', { class: 'row-sub' }, 'vs ' + m.opponent) : null,
            scoreNode,
            m.vods.length
              ? el('span', {}, m.vods.map((v, i) => el('a', { class: 'vod-link', href: v.href, target: '_blank', rel: 'noopener', title: v.label }, 'G' + (i + 1))))
              : null,
            m.matchUrl ? el('a', { href: m.matchUrl, target: '_blank', rel: 'noopener', class: 'row-sub' }, 'Szczegóły') : null,
          ]);
        }))
      );
    }

    function renderHistory(groups) {
      historyContent.textContent = '';
      if (!groups.length) {
        historyContent.appendChild(el('div', { class: 'empty-note' }, 'Brak meczów.'));
        return;
      }
      const cutoff = Date.now() / 1000 - 730 * 86400;
      const recent = groups.filter((g) => g.ongoing || g.last.start_time >= cutoff);
      const older = groups.filter((g) => !g.ongoing && g.last.start_time < cutoff);
      const container = el('div', { class: 'tournament-list' }, []);
      historyContent.appendChild(container);

      function leagueCard(lg) {
        const dateRange = fmtDate(lg.first.start_time) + ' – ' + fmtDate(lg.last.start_time);
        const record = lg.wins + 'W : ' + lg.losses + 'L';
        const shown = lg.matches.slice(0, 6);
        const rest = lg.matches.slice(6);
        return el('div', { class: 'tournament-card' }, [
          el('div', { class: 'tournament-head' }, [
            el('span', { class: 'score ' + (lg.wins >= lg.losses ? 'win' : 'loss') }, record),
            tierChip(lg.tier),
            lg.ongoing ? el('span', { class: 'chip chip-ongoing' }, 'W trakcie') : null,
            el('div', { class: 'tournament-name' }, lg.name),
            el('div', { class: 'tournament-meta' }, dateRange),
          ]),
          el('div', { class: 'match-row-list' }, shown.map((m) => matchRow(m))),
          rest.length
            ? el('details', { class: 'show-more-wrap' }, [
                el('summary', null, 'Pokaż starsze mecze w tym turnieju (' + rest.length + ')'),
                el('div', { class: 'match-row-list' }, rest.map((m) => matchRow(m, true))),
              ])
            : null,
        ]);
      }

      function matchRow(m, dim) {
        const won = teamWon(m);
        const teamScore = m.radiant ? m.radiant_score : m.dire_score;
        const oppScore = m.radiant ? m.dire_score : m.radiant_score;
        const opponent = clean(m.opposing_team_name) || '?';
        const oppUrl = m.opposing_team_id
          ? 'https://www.opendota.com/teams/' + m.opposing_team_id
          : '';
        return el('div', { class: 'match-row' + (dim ? ' dim' : '') }, [
          el('div', { class: 'row-date' }, fmtDate(m.start_time)),
          el('div', { class: 'match-opp' }, [
            m.opposing_team_logo
              ? el('img', { src: m.opposing_team_logo, alt: '', loading: 'lazy' })
              : null,
            oppUrl
              ? el('a', { class: 'opp-link', href: oppUrl, target: '_blank', rel: 'noopener' }, opponent)
              : el('span', { class: 'name' }, opponent),
          ]),
          el('span', { class: 'score ' + (won ? 'win' : 'loss') }, teamScore + ' : ' + oppScore),
          el('span', { class: (won ? 'win' : 'loss') + ' row-sub' }, won ? 'W' : 'L'),
          el('span', { class: 'row-sub' }, fmtClock(m.duration)),
          m.match_id
            ? el('a', { class: 'row-sub', href: 'https://www.opendota.com/matches/' + m.match_id, target: '_blank', rel: 'noopener' }, 'Mecz')
            : null,
        ]);
      }

      recent.forEach((lg) => container.appendChild(leagueCard(lg)));

      if (older.length) {
        const olderContainer = el('div', { class: 'tournament-list' });
        const moreBtn = el('button', { class: 'btn', type: 'button' }, 'Pokaż starsze turnieje (' + older.length + ')');
        older.forEach((lg) => olderContainer.appendChild(leagueCard(lg)));
        olderContainer.hidden = true;
        moreBtn.addEventListener('click', () => {
          olderContainer.hidden = !olderContainer.hidden;
          moreBtn.textContent = olderContainer.hidden
            ? 'Pokaż starsze turnieje (' + older.length + ')'
            : 'Ukryj starsze turnieje';
        });
        historyContent.appendChild(olderContainer);
        historyContent.appendChild(el('div', { class: 'show-more-wrap' }, moreBtn));
      }
    }

    async function refreshLiveOnly() {
      try {
        const live = await fetchJson(OPENDOTA + '/live', 2);
        renderLive(live);
      } catch (_) {
        return;
      }
    }

    async function loadAll(showSpinner) {
      if (showSpinner) {
        liveContent.innerHTML = '<div class="placeholder">Ładowanie…</div>';
        upcomingContent.innerHTML = '<div class="placeholder">Ładowanie…</div>';
        resultsContent.innerHTML = '<div class="placeholder">Ładowanie…</div>';
        recentContent.innerHTML = '<div class="placeholder">Ładowanie…</div>';
        historyContent.innerHTML = '<div class="placeholder">Ładowanie…</div>';
      }
      setStatus('');
      const errors = [];

      const [teamRes, matchesRes, leaguesRes, liveRes, liquiRes] = await Promise.allSettled([
        fetchJson(OPENDOTA + '/teams/' + TEAM_ID),
        fetchJson(OPENDOTA + '/teams/' + TEAM_ID + '/matches'),
        fetchJson(OPENDOTA + '/leagues'),
        fetchJson(OPENDOTA + '/live'),
        fetchJson(LIQUIPEDIA + '?action=parse&page=' + LIQUI_PAGE + '&prop=text&format=json&origin=*'),
      ]);

      if (teamRes.status === 'fulfilled') renderTeam(teamRes.value);
      else errors.push('OpenDota (zespół)');

      if (leaguesRes.status === 'fulfilled') {
        leagues = new Map((leaguesRes.value || []).map((l) => [String(l.leagueid), l]));
      } else {
        errors.push('OpenDota (ligi)');
      }

      if (matchesRes.status === 'fulfilled') {
        leagueGroups = groupMatchesByLeague(matchesRes.value || [], leagues);
        renderHistory(leagueGroups);
      } else {
        errors.push('OpenDota (mecze)');
        historyContent.innerHTML = '<div class="placeholder">Nie udało się pobrać meczów z OpenDota.</div>';
      }

      if (liveRes.status === 'fulfilled') renderLive(liveRes.value);
      else {
        errors.push('OpenDota (na żywo)');
        liveContent.innerHTML = '<div class="placeholder">Nie udało się pobrać meczów na żywo.</div>';
      }

      if (liquiRes.status === 'fulfilled') {
        const parsed = parseLiquipedia(liquiRes.value && liquiRes.value.parse && liquiRes.value.parse.text && liquiRes.value.parse.text['*']);
        if (parsed) {
          renderUpcoming(parsed.upcoming);
          renderResults(parsed.achievements);
          renderRecent(parsed.recentMatches);
        } else {
          renderUpcoming([]);
          renderResults(null);
          recentContent.innerHTML = '<div class="placeholder">Nie udało się pobrać meczów z Liquipedii.</div>';
        }
      } else {
        errors.push('Liquipedia');
        renderUpcoming([]);
        renderResults(null);
        recentContent.innerHTML = '<div class="placeholder">Nie udało się pobrać danych z Liquipedii.</div>';
      }

      if (errors.length) setStatus('Nie udało się pobrać części danych: ' + errors.join(', ') + '. Odśwież stronę za chwilę.');
      lastRefresh = Date.now();
      noteUpdate();
    }

    refreshBtn.addEventListener('click', () => loadAll(true));
    loadAll(true);

    if (typeof setInterval === 'function') {
      setInterval(refreshLiveOnly, LIVE_REFRESH_MS);
    }
  }

  return { init, parseLiquipedia, groupMatchesByLeague, teamWon };
})();

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  DotaSite.init();
  if (typeof window.DotaSite === 'undefined') window.DotaSite = DotaSite;
} else if (typeof globalThis !== 'undefined') {
  globalThis.DotaSite = DotaSite;
}