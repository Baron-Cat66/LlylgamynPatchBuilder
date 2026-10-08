'use strict';
(() => {
  const L = Llylgamyn;
  const $ = id => document.getElementById(id);
  let state = null, tab = 0, active = { row: 0, column: 'unknown' }, selected = new Set(), undo = [], token = 0;
  const keys = ['unknown', 'known'];
  const table = $('rows');
  function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
  function changed(row) { return row.unknown !== row.originalUnknown || row.known !== row.originalKnown; }
  function snapshot() { return state.scenarios.map(s => s.rows.map(r => [r.unknown, r.known])); }
  function remember() { undo.push(snapshot()); if (undo.length > 50) undo.shift(); }
  function counts() {
    if (!state) return;
    let total = 0;
    state.scenarios.forEach((s, i) => {
      const count = s.rows.filter(changed).length; total += count;
      $('tab' + i).textContent = `${s.title} (${count})`;
      $('tab' + i).setAttribute('aria-selected', String(tab === i));
    });
    $('changes').textContent = `${total} / 335 件を変更`;
    $('undo').disabled = !undo.length;
  }
  function paintSelection() {
    for (const row of table.children) row.classList.toggle('selected', selected.has(Number(row.dataset.no)));
  }
  function render() {
    table.replaceChildren();
    if (!state) return;
    for (const row of state.scenarios[tab].rows) {
      const tr = document.createElement('tr'); tr.dataset.no = row.no;
      const no = document.createElement('td'); no.className = 'number'; no.textContent = String(row.no).padStart(3, '0'); no.tabIndex = 0; no.title = 'クリックで行選択。Ctrlで追加、Shiftで範囲選択。';
      function choose(event) {
        if (event.shiftKey) { const a = Math.min(active.row, row.no), b = Math.max(active.row, row.no); selected = new Set(Array.from({ length: b - a + 1 }, (_, j) => a + j)); }
        else if (event.ctrlKey || event.metaKey) { if (selected.has(row.no)) selected.delete(row.no); else selected.add(row.no); }
        else selected = new Set([row.no]);
        active.row = row.no; paintSelection();
      }
      no.addEventListener('click', choose); no.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(event); } }); tr.append(no);
      for (const key of keys) {
        const td = document.createElement('td'), input = document.createElement('input');
        input.type = 'text'; input.value = row[key]; input.dataset.column = key; input.dataset.row = row.no;
        input.setAttribute('aria-label', `Scenario ${tab + 1} No.${row.no} ${key === 'unknown' ? '未確定名' : '確定名'}`);
        input.classList.toggle('modified', row[key] !== row[key === 'unknown' ? 'originalUnknown' : 'originalKnown']);
        input.addEventListener('focus', () => { active = { row: row.no, column: key }; selected = new Set([row.no]); paintSelection(); });
        input.addEventListener('change', () => {
          if (input.value === row[key]) return;
          try { L.cp932Encode(input.value); remember(); row[key] = input.value; input.classList.toggle('modified', row[key] !== row[key === 'unknown' ? 'originalUnknown' : 'originalKnown']); counts(); status(`No.${String(row.no).padStart(3, '0')} を編集しました。`); }
          catch (error) { input.value = row[key]; status(error.message, true); }
        });
        input.addEventListener('paste', event => {
          const text = event.clipboardData.getData('text/plain');
          if (/[\t\r\n]/.test(text)) { event.preventDefault(); paste(text); }
        });
        td.append(input); tr.append(td);
      }
      table.append(tr);
    }
    counts(); paintSelection();
  }
  function parsePaste(text) {
    let lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    while (lines.length && lines.at(-1) === '') lines.pop();
    if (lines[0] && /^(?:No\.?|番号)\t/i.test(lines[0])) lines.shift();
    if (!lines.length) throw new Error('貼り付けるデータがありません。');
    const edits = [], rows = state.scenarios[tab].rows;
    for (let j = 0; j < lines.length; j++) {
      const cells = lines[j].split('\t'); let no = active.row + j, columns;
      if (cells.length === 3) {
        if (!/^\d+$/.test(cells[0])) throw new Error(`${j + 1}行目のNo.が不正です。`);
        no = Number(cells[0]); columns = [[keys[0], cells[1]], [keys[1], cells[2]]];
      } else if (cells.length === 2) columns = [[keys[0], cells[0]], [keys[1], cells[1]]];
      else if (cells.length === 1) columns = [[active.column, cells[0]]];
      else throw new Error(`${j + 1}行目は1〜3列で貼り付けてください。`);
      if (no < 0 || no >= rows.length) throw new Error(`No.${no} はこのシナリオの範囲外です。`);
      for (const [key, value] of columns) { L.cp932Encode(value); edits.push({ no, key, value }); }
    }
    return edits;
  }
  function paste(text) {
    if (!state) return;
    try {
      const edits = parsePaste(text), s = state.scenarios[tab];
      const trial = { ...s, rows: s.rows.map(r => ({ ...r })) };
      for (const e of edits) trial.rows[e.no][e.key] = e.value;
      L.rebuildScenarioEntry(trial); // Validate the entire paste before committing.
      remember(); for (const e of edits) s.rows[e.no][e.key] = e.value;
      selected = new Set(edits.map(e => e.no)); render();
      $('pasteDialog').close(); $('pasteText').value = '';
      status(`${selected.size} 行に貼り付けました。`);
    } catch (error) { status(error.message, true); $('pasteError').textContent = error.message; }
  }
  async function copy(all = false) {
    if (!state) return;
    const rows = state.scenarios[tab].rows.filter(r => all || selected.has(r.no));
    if (!rows.length) { status('コピーする行をNo.欄で選択してください。', true); return; }
    const text = rows.map(r => `${String(r.no).padStart(3, '0')}\t${r.unknown}\t${r.known}`).join('\r\n');
    try { await navigator.clipboard.writeText(text); status(`${rows.length} 行をコピーしました。`); }
    catch (_) { $('copyText').value = text; $('copyDialog').showModal(); $('copyText').focus(); $('copyText').select(); }
  }
  function download(bytes, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function open(file) {
    if (!file) return;
    if (state && state.scenarios.some(s => s.rows.some(changed)) && !confirm('編集中の名称を破棄して別のTrack 01を開きますか？')) return;
    const thisToken = ++token; $('generate').disabled = true; status('Track 01を確認しています…');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer()); const next = await L.loadTrack(bytes);
      if (thisToken !== token) return;
      state = next; tab = 0; selected = new Set(); active = { row: 0, column: 'unknown' }; undo = [];
      $('filename').textContent = file.name; $('hash').textContent = `SHA-256一致 / ${bytes.length.toLocaleString()} bytes`;
      $('editor').hidden = false; $('empty').hidden = true;
      for (const button of document.querySelectorAll('[data-needs-track]')) button.disabled = false;
      render(); status('Track 01を読み込みました。335件の名称を元BINから抽出しています。');
    } catch (error) { status(error.message, true); }
    finally { if (thisToken === token) $('generate').disabled = !state; $('file').value = ''; }
  }
  $('file').addEventListener('change', event => open(event.target.files[0]));
  $('open').addEventListener('click', () => $('file').click());
  $('drop').addEventListener('dragover', event => { event.preventDefault(); $('drop').classList.add('dragover'); });
  $('drop').addEventListener('dragleave', () => $('drop').classList.remove('dragover'));
  $('drop').addEventListener('drop', event => { event.preventDefault(); $('drop').classList.remove('dragover'); open(event.dataTransfer.files[0]); });
  for (let i = 0; i < 3; i++) $('tab' + i).addEventListener('click', () => { tab = i; selected = new Set(); active = { row: 0, column: 'unknown' }; render(); $('scroll').scrollTop = 0; });
  $('copy').addEventListener('click', () => copy()); $('copyAll').addEventListener('click', () => copy(true));
  $('selectAll').addEventListener('click', () => { selected = new Set(state.scenarios[tab].rows.map(r => r.no)); paintSelection(); status('このシナリオの全行を選択しました。'); });
  $('paste').addEventListener('click', () => { $('pasteStart').textContent = `Scenario #${tab + 1} / 開始 No.${String(active.row).padStart(3, '0')} / ${active.column === 'unknown' ? '未確定名' : '確定名'}`; $('pasteError').textContent = ''; $('pasteDialog').showModal(); $('pasteText').focus(); });
  $('applyPaste').addEventListener('click', () => paste($('pasteText').value));
  $('undo').addEventListener('click', () => {
    const previous = undo.pop(); if (!previous) return;
    previous.forEach((s, i) => s.forEach((r, j) => { state.scenarios[i].rows[j].unknown = r[0]; state.scenarios[i].rows[j].known = r[1]; })); render(); status('直前の編集を取り消しました。');
  });
  $('reset').addEventListener('click', () => {
    const rows = state.scenarios[tab].rows.filter(r => selected.has(r.no));
    if (!rows.length) { status('戻す行をNo.欄で選択してください。', true); return; }
    remember(); rows.forEach(r => { r.unknown = r.originalUnknown; r.known = r.originalKnown; }); render(); status('選択行を元の名称に戻しました。');
  });
  $('generate').addEventListener('click', async () => {
    if (!state) return;
    $('generate').disabled = true; status('IPSを生成しています…');
    await new Promise(resolve => setTimeout(resolve, 20));
    try {
      const makanito = $('makanito').checked;
      const modified = L.buildModifiedTrack(state, makanito), ips = L.makeIPS(state.original, modified.track);
      if (!ips.runs) { status('変更がありません。名称を編集するか、マカニト修正を選択してください。', true); return; }
      const name = makanito ? 'Llylgamyn_ItemNames_Makanito_v1.4.ips' : 'Llylgamyn_ItemNames_v1.4.ips';
      download(ips.bytes, name); status(`IPS生成完了：${ips.bytes.length.toLocaleString()} bytes / ${ips.runs} レコード / ${modified.sectors.length} セクターを変更`);
    } catch (error) { status(error.message, true); }
    finally { $('generate').disabled = false; }
  });
  document.addEventListener('keydown', event => {
    const inText = ['INPUT', 'TEXTAREA'].includes(event.target.tagName);
    if ((event.ctrlKey || event.metaKey) && !inText && state) {
      if (event.key.toLowerCase() === 'c') { event.preventDefault(); copy(); }
      if (event.key.toLowerCase() === 'a') { event.preventDefault(); $('selectAll').click(); }
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); $('undo').click(); }
    }
  });
  window.addEventListener('beforeunload', event => {
    if (state && state.scenarios.some(s => s.rows.some(changed))) { event.preventDefault(); event.returnValue = ''; }
  });
})();
