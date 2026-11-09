/* Модуль расчётов социометрии. Чистые функции, без DOM.
   Формулы описаны в docs/METHOD.md. */
(function (root) {
  'use strict';

  // Округление до 2 знаков, половина - от нуля (0.875 -> 0.88, -0.125 -> -0.13)
  function round2(x) {
    if (x === null || x === undefined || !isFinite(x)) return x;
    var s = x < 0 ? -1 : 1;
    return s * Math.round(Math.abs(x) * 100 + 1e-7) / 100;
  }
  // Целочисленное округление половины вверх (для порогов статусов)
  function roundInt(x) { return Math.floor(x + 0.5 + 1e-9); }

  function fmt(x, digits) {
    if (x === null || x === undefined || !isFinite(x)) return '-';
    return round2(x).toFixed(digits === undefined ? 2 : digits);
  }

  var STATUS = {
    star: 'Звезда',
    preferred: 'Предпочитаемый',
    accepted: 'Принятый',
    neglected: 'Пренебрегаемый',
    rejected: 'Отвергаемый',
    isolated: 'Изолированный'
  };
  var STATUS_ORDER = ['star', 'preferred', 'accepted', 'neglected', 'rejected', 'isolated'];

  function thresholds(mPlus) {
    return {
      star: roundInt(2 * mPlus),
      preferred: roundInt(1.5 * mPlus),
      rejected: roundInt(mPlus / 2)
    };
  }

  // Статус по полученным + и - и среднему числу полученных + в группе
  function statusOf(rp, rn, mPlus) {
    var t = thresholds(mPlus);
    if (rp === 0 && rn === 0) return 'isolated';
    if (rn > 0 && (rp === 0 || rp < t.rejected)) return 'rejected';
    if (rp >= t.star) return 'star';
    if (rp >= t.preferred) return 'preferred';
    if (rp > 0 && rn > 1.5 * rp) return 'neglected';
    return 'accepted';
  }

  // participants: [{id,...}], choices: {fromId: {toId: 1|-1}} -> матрица N x N
  function buildMatrix(participants, choices) {
    var n = participants.length, idx = {}, M = [], i, j;
    for (i = 0; i < n; i++) idx[participants[i].id] = i;
    for (i = 0; i < n; i++) { M.push([]); for (j = 0; j < n; j++) M[i].push(0); }
    choices = choices || {};
    Object.keys(choices).forEach(function (from) {
      if (!(from in idx)) return;
      var row = choices[from] || {};
      Object.keys(row).forEach(function (to) {
        if (!(to in idx) || to === from) return;
        var v = row[to];
        if (v === 1 || v === -1) M[idx[from]][idx[to]] = v;
      });
    });
    return M;
  }

  function div(a, b) { return b ? a / b : null; }

  // Полный анализ матрицы
  function analyze(M) {
    var N = M.length, i, j;
    var Rp = [], Rn = [], Sp = [], Sn = [];
    for (i = 0; i < N; i++) { Rp.push(0); Rn.push(0); Sp.push(0); Sn.push(0); }
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) {
      if (i === j) continue;
      if (M[i][j] === 1) { Sp[i]++; Rp[j]++; }
      else if (M[i][j] === -1) { Sn[i]++; Rn[j]++; }
    }
    var mutPos = [], mutNeg = [], paradox = [];
    var inVp = [], inVn = [];
    for (i = 0; i < N; i++) { inVp.push(false); inVn.push(false); }
    for (i = 0; i < N; i++) for (j = i + 1; j < N; j++) {
      var a = M[i][j], b = M[j][i];
      if (a === 1 && b === 1) { mutPos.push([i, j]); inVp[i] = inVp[j] = true; }
      else if (a === -1 && b === -1) { mutNeg.push([i, j]); inVn[i] = inVn[j] = true; }
      else if (a === 1 && b === -1) paradox.push([i, j]);
      else if (a === -1 && b === 1) paradox.push([j, i]); // первый ставит +, второй -
    }
    var sum = function (arr) { return arr.reduce(function (s, x) { return s + x; }, 0); };
    var count = function (f) { var c = 0; for (var k = 0; k < N; k++) if (f(k)) c++; return c; };
    var Lp = sum(Sp), Ln = sum(Sn);
    var C = N * (N - 1) / 2;
    var Vp = count(function (k) { return inVp[k]; });
    var Vn = count(function (k) { return inVn[k]; });
    var Mp = mutPos.length, Mn = mutNeg.length, Q = paradox.length;
    var mPlus = N ? sum(Rp) / N : 0;
    var mMinus = N ? sum(Rn) / N : 0;

    // Компоненты неориентированного графа + выборов
    var parent = [];
    for (i = 0; i < N; i++) parent.push(i);
    var find = function (x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (i = 0; i < N; i++) for (j = 0; j < N; j++)
      if (i !== j && M[i][j] === 1) { var ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; }
    var compSize = {};
    for (i = 0; i < N; i++) { var r = find(i); compSize[r] = (compSize[r] || 0) + 1; }
    var components = [];
    Object.keys(compSize).forEach(function (r) {
      var members = [];
      for (var k = 0; k < N; k++) if (String(find(k)) === r) members.push(k);
      components.push(members);
    });
    components.sort(function (x, y) { return y.length - x.length; });
    var Nmax = components.length ? components[0].length : 0;

    var dmax = N ? Math.max.apply(null, Rp) : 0;
    var central = N > 1 ? sum(Rp.map(function (x) { return dmax - x; })) / ((N - 1) * (N - 1)) : null;

    var noPosTies = count(function (k) { return Sp[k] === 0 && Rp[k] === 0; });
    var gotPos = count(function (k) { return Rp[k] > 0; });
    var gotNeg = count(function (k) { return Rn[k] > 0; });
    var onlyNeg = count(function (k) { return Rn[k] > 0 && Rp[k] === 0; });

    var Gg = div(Vp, C);
    var group = {
      Ag: div(Lp + Ln, N),
      Gg: Gg,
      Ggmax: C ? Math.max(Gg, Math.floor(Lp / 2) / C) : null,
      GgClassic: div(Mp, C),
      U: div(Mp, Lp),
      Kg: div(Vn, C),
      KgClassic: div(Mn, C),
      Rneg: Ln ? 2 * Mn / Ln : null,
      covMutPos: div(Vp, N),
      central: central,
      largest: div(Nmax, N),
      componentsCount: components.length,
      noPos: div(noPosTies, N),
      paradox: div(Q, C),
      covPos: div(gotPos, N),
      covNeg: div(gotNeg, N),
      covMutNeg: div(Vn, N),
      onlyNeg: div(onlyNeg, N)
    };

    var personal = [];
    for (i = 0; i < N; i++) {
      personal.push({
        Rp: Rp[i], Rn: Rn[i], Sp: Sp[i], Sn: Sn[i],
        CiPos: div(Rp[i], N - 1),
        CiNeg: div(Rn[i], N - 1),
        Ci: div(Rp[i] - Rn[i], N - 1),
        EPos: div(Sp[i], N - 1),
        ENeg: div(Sn[i], N - 1),
        E: div(Sp[i] + Sn[i], N - 1),
        Kud: Sp[i] ? Rp[i] / Sp[i] : 0,
        status: statusOf(Rp[i], Rn[i], mPlus),
        mutualPos: inVp[i], mutualNeg: inVn[i]
      });
    }
    var statusCounts = {};
    STATUS_ORDER.forEach(function (s) { statusCounts[s] = 0; });
    personal.forEach(function (p) { statusCounts[p.status]++; });

    return {
      N: N, C: C, M: M,
      Lp: Lp, Ln: Ln, Mp: Mp, Mn: Mn, Vp: Vp, Vn: Vn, Q: Q,
      mPlus: mPlus, mMinus: mMinus,
      meanPosMade: div(Lp, N), meanNegMade: div(Ln, N),
      thresholds: thresholds(mPlus),
      mutPos: mutPos, mutNeg: mutNeg, paradox: paradox,
      components: components, Nmax: Nmax, dmax: dmax,
      counts: {
        noPosTies: noPosTies, gotPos: gotPos, gotNeg: gotNeg, onlyNeg: onlyNeg,
        noRecvPos: N - gotPos,
        noRecvPosButChose: count(function (k) { return Rp[k] === 0 && Sp[k] > 0; }),
        noMutualPos: N - Vp,
        isolatedStatus: statusCounts.isolated
      },
      group: group,
      personal: personal,
      statusCounts: statusCounts
    };
  }

  /* Рекомендации: порядок фиксирован, каждая появляется только при своём условии;
     если ни одно условие не выполнено, рекомендаций нет. */
  function recommendations(a) {
    var c = a.counts, out = [];
    var multi = a.components.filter(function (x) { return x.length > 1; }).length;
    if (multi >= 2) out.push('rec.groups');
    if (c.noPosTies > 0) out.push('rec.noTies');
    else if (c.noRecvPos > 0) out.push('rec.access');
    if (c.noMutualPos > 0) out.push('rec.mutual');
    if (a.Ln > 0) out.push('rec.negative');
    if (a.Q > 0) out.push('rec.paradox');
    return out;
  }

  /* Индивидуальная социограмма: узлы - участник и все, с кем у него есть связь
     этого знака; связи - его собственные плюс выборы внутри этого круга, сделанные теми,
     кто сам как-либо (+ или -) выбрал участника. Возвращает индексы узлов и связи. */
  function egoEdges(M, e, sign) {
    var n = M.length, inSet = [], out = [], i, j;
    for (i = 0; i < n; i++) inSet.push(i === e || M[e][i] === sign || M[i][e] === sign);
    function shown(u, v) { return M[u][v] === sign && (u === e || v === e || M[u][e] !== 0); }
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      if (!inSet[i] || !inSet[j]) continue;
      var a = shown(i, j), b = shown(j, i);
      if (M[i][j] === sign && M[j][i] === sign && (a || b)) out.push({ from: i, to: j, mutual: true });
      else { if (a) out.push({ from: i, to: j, mutual: false }); if (b) out.push({ from: j, to: i, mutual: false }); }
    }
    var nodes = []; for (i = 0; i < n; i++) if (inSet[i]) nodes.push(i);
    return { nodes: nodes, edges: out };
  }

  function analyzeProtocol(proto) {
    var main = analyze(buildMatrix(proto.participants, proto.choices));
    var perc = proto.perceptive ? analyze(buildMatrix(proto.participants, proto.pchoices)) : null;
    return { main: main, perc: perc };
  }

  // Описание 14 групповых индексов (ключи и порядок для отчёта)
  var GROUP_INDEX_KEYS = ['Ag', 'Gg', 'U', 'Kg', 'Rneg', 'covMutPos', 'central', 'largest',
    'noPos', 'paradox', 'covPos', 'covNeg', 'covMutNeg', 'onlyNeg'];

  var api = {
    round2: round2, roundInt: roundInt, fmt: fmt,
    STATUS: STATUS, STATUS_ORDER: STATUS_ORDER, GROUP_INDEX_KEYS: GROUP_INDEX_KEYS,
    statusOf: statusOf, thresholds: thresholds, recommendations: recommendations, egoEdges: egoEdges,
    buildMatrix: buildMatrix, analyze: analyze, analyzeProtocol: analyzeProtocol
  };
  root.SM = root.SM || {};
  root.SM.calc = api;
})(typeof window !== 'undefined' ? window : this);
