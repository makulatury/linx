/* Контрольные данные для тестов и демонстрационного протокола:
   группа из 8 человек с заранее посчитанными групповыми индексами и статусами. */
(function (root) {
  'use strict';
  var names = ['Алексеева Анна', 'Борисов Борис', 'Васильева Вера', 'Григорьев Глеб',
    'Дмитриева Дарья', 'Егоров Евгений', 'Жукова Жанна', 'Зайцев Захар'];
  var L = 'ABCDEFGH';
  // кто -> кого: '+' / '-'
  var raw = {
    A: { B: '+', C: '+', D: '+', E: '+' },
    B: { A: '+', D: '-' },
    C: { A: '+', G: '+', H: '-' },
    D: { A: '+', H: '-', G: '-' },
    E: { A: '+', C: '+', H: '-' },
    F: { B: '+', D: '+' },
    G: { B: '+', F: '+', D: '-' },
    H: { D: '-', E: '-', F: '-' }
  };
  function group3() {
    var participants = names.map(function (n, i) { return { id: 'g3_' + L[i], name: n, photo: null }; });
    var choices = {};
    Object.keys(raw).forEach(function (f) {
      choices['g3_' + f] = {};
      Object.keys(raw[f]).forEach(function (t) { choices['g3_' + f]['g3_' + t] = raw[f][t] === '+' ? 1 : -1; });
    });
    return { name: 'Контрольная группа (8 человек)', perceptive: false, participants: participants, choices: choices, pchoices: {} };
  }
  // Ожидаемые значения групповых индексов
  var group3Expected = {
    Ag: 2.88, Gg: 0.18, Ggmax: 0.25, U: 0.29, Kg: 0.14, Rneg: 0.67, covMutPos: 0.63, central: 0.37,
    largest: 0.88, componentsCount: 2, noPos: 0.13, paradox: 0, covPos: 0.88, covNeg: 0.63,
    covMutNeg: 0.5, onlyNeg: 0.13
  };
  // Контрольные случаи статусов: [R+, R-, m+, статус]
  var statusCases = [
    [6, 0, 1.6, 'star'], [3, 1, 1.6, 'star'], [2, 1, 1.6, 'preferred'], [2, 0, 1.6, 'preferred'],
    [1, 1, 1.6, 'accepted'], [0, 1, 1.6, 'rejected'], [0, 4, 1.6, 'rejected'], [0, 0, 1.6, 'isolated'],
    [5, 0, 2.0, 'star'], [4, 0, 2.0, 'star'], [3, 0, 2.0, 'preferred'], [3, 1, 2.0, 'preferred'],
    [2, 0, 2.0, 'accepted'], [1, 0, 2.0, 'accepted'], [1, 1, 2.0, 'accepted'], [1, 2, 2.0, 'neglected'],
    [0, 2, 2.0, 'rejected'], [0, 4, 2.0, 'rejected'],
    [4, 0, 1.75, 'star'], [3, 0, 1.75, 'preferred'], [2, 0, 1.75, 'accepted'], [2, 3, 1.75, 'accepted'],
    [1, 1, 1.75, 'accepted'], [0, 3, 1.75, 'rejected']
  ];
  root.SM = root.SM || {};
  root.SM.fixtures = { group3: group3, group3Expected: group3Expected, statusCases: statusCases };
})(typeof window !== 'undefined' ? window : this);
