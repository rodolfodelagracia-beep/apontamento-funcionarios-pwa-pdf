import React, { useEffect, useMemo, useState } from 'react'
import jsPDF from 'jspdf'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const STORAGE_KEY = 'apontamento-funcionarios-pdf-v2'

const funcionariosIniciais = [
  { id: '1', nome: 'Ademir', funcao: 'Serviços gerais', valorHora: 12 },
  { id: '2', nome: 'Marcos', funcao: 'Serviços gerais', valorHora: 12 }
]

function formatCurrency(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0))
}

function getDaysInMonth(year, monthIndex) {
  const total = new Date(year, monthIndex + 1, 0).getDate()
  return Array.from({ length: total }, (_, i) => {
    const date = new Date(year, monthIndex, i + 1)
    const iso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    return { dia: i + 1, iso, semana: date.getDay(), nomeSemana: DIAS[date.getDay()] }
  })
}

function parseLancamento(raw, especial) {
  const texto = String(raw || '').trim().replace(/\s+/g, '')
  if (!texto) return { base: 0, he50: 0, he100: 0, valido: true }
  if (/^\d+(?:[\.,]\d+)?$/.test(texto)) {
    const h = Number(texto.replace(',', '.'))
    return especial ? { base: 0, he50: 0, he100: h, valido: true } : { base: h, he50: 0, he100: 0, valido: true }
  }
  const m = texto.match(/^(\d+(?:[\.,]\d+)?)\+(\d+(?:[\.,]\d+)?)$/)
  if (m) {
    const normal = Number(m[1].replace(',', '.'))
    const extra = Number(m[2].replace(',', '.'))
    return especial ? { base: 0, he50: 0, he100: normal + extra, valido: true } : { base: normal, he50: extra, he100: 0, valido: true }
  }
  return { base: 0, he50: 0, he100: 0, valido: false }
}

function baixarBackupJSON(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'backup-apontamento-funcionarios.json'
  a.click()
  URL.revokeObjectURL(url)
}

function gerarPDFDetalhado({ ano, mes, funcionarios, dias, lancamentos, feriados }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const margem = 10
  const pageW = 297
  const pageH = 210
  const largura = pageW - margem * 2
  let y = 14

  const resumo = funcionarios.map((func) => {
    let base = 0
    let he50 = 0
    let he100 = 0

    const diario = dias.map((dia) => {
      const raw = lancamentos[func.id]?.[dia.iso] || ''
      const especial = dia.semana === 0 || feriados.includes(dia.iso)
      const calc = parseLancamento(raw, especial)
      base += calc.base
      he50 += calc.he50
      he100 += calc.he100
      return { dia: dia.dia, nomeSemana: dia.nomeSemana, raw }
    })

    const valorBase = base * func.valorHora
    const valor50 = he50 * func.valorHora * 1.5
    const valor100 = he100 * func.valorHora * 2
    const total = valorBase + valor50 + valor100

    return { ...func, base, he50, he100, total, diario }
  })

  const totais = resumo.reduce((acc, item) => {
    acc.base += item.base
    acc.he50 += item.he50
    acc.he100 += item.he100
    acc.total += item.total
    return acc
  }, { base: 0, he50: 0, he100: 0, total: 0 })

  const texto = (txt, x, yy, opts = {}) => doc.text(String(txt), x, yy, opts)
  const linha = (x1, y1, x2, y2) => doc.line(x1, y1, x2, y2)
  const caixa = (x, yy, w, h) => doc.rect(x, yy, w, h)

  function novaPagina() {
    doc.addPage()
    y = 14
  }

  function cabecalhoPagina(titulo = 'Relatório de Apontamento de Funcionários') {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    texto(titulo, margem, y)
    y += 7
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    texto(`Competência: ${MESES[mes]} / ${ano}`, margem, y)
    texto(`Emitido em: ${new Date().toLocaleDateString('pt-BR')}`, pageW - margem, y, { align: 'right' })
    y += 5
    linha(margem, y, pageW - margem, y)
    y += 6
  }

  cabecalhoPagina('Resumo geral')

  const colunasResumo = {
    nome: margem,
    funcao: 70,
    hora: 130,
    base: 155,
    he50: 175,
    he100: 195,
    total: 225,
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  texto('Funcionário', colunasResumo.nome, y)
  texto('Função', colunasResumo.funcao, y)
  texto('R$/h', colunasResumo.hora, y, { align: 'right' })
  texto('Base', colunasResumo.base, y, { align: 'right' })
  texto('HE50', colunasResumo.he50, y, { align: 'right' })
  texto('HE100', colunasResumo.he100, y, { align: 'right' })
  texto('Total', colunasResumo.total, y, { align: 'right' })
  y += 4
  linha(margem, y, pageW - margem, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  resumo.forEach((item) => {
    if (y > 180) {
      novaPagina()
      cabecalhoPagina('Resumo geral')
    }
    doc.setFontSize(10)
    texto(item.nome, colunasResumo.nome, y)
    texto(item.funcao, colunasResumo.funcao, y)
    texto(item.valorHora.toFixed(2).replace('.', ','), colunasResumo.hora, y, { align: 'right' })
    texto(item.base, colunasResumo.base, y, { align: 'right' })
    texto(item.he50, colunasResumo.he50, y, { align: 'right' })
    texto(item.he100, colunasResumo.he100, y, { align: 'right' })
    texto(formatCurrency(item.total), colunasResumo.total, y, { align: 'right' })
    y += 6
    linha(margem, y, pageW - margem, y)
    y += 4
  })

  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  texto(`Totais gerais  •  Base: ${totais.base}  •  HE50: ${totais.he50}  •  HE100: ${totais.he100}  •  Total: ${formatCurrency(totais.total)}`, margem, y)

  novaPagina()
  cabecalhoPagina('Detalhamento diário por funcionário')

  function desenharBlocoDias(func, diasBloco, tituloBloco) {
    const hCab = 12
    const hLinha = 12
    const nomeW = 42
    const totalW = 14
    const colW = (largura - nomeW - totalW * 4) / diasBloco.length

    if (y + hCab + hLinha + 18 > pageH - margem) {
      novaPagina()
      cabecalhoPagina('Detalhamento diário por funcionário')
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    texto(`${func.nome} — ${func.funcao} — ${tituloBloco}`, margem, y)
    texto(`R$/h: ${formatCurrency(func.valorHora)}`, pageW - margem, y, { align: 'right' })
    y += 5

    caixa(margem, y, nomeW, hCab)
    texto('Funcionário', margem + 2, y + 7)

    diasBloco.forEach((d, idx) => {
      const x = margem + nomeW + idx * colW
      caixa(x, y, colW, hCab)
      doc.setFontSize(8)
      texto(d.dia, x + colW / 2, y + 4.5, { align: 'center' })
      texto(d.nomeSemana, x + colW / 2, y + 8.8, { align: 'center' })
    })

    const totaisX = margem + nomeW + diasBloco.length * colW
    ;['Base', 'HE50', 'HE100', 'Total'].forEach((lab, idx) => {
      const x = totaisX + idx * totalW
      caixa(x, y, totalW, hCab)
      texto(lab, x + totalW / 2, y + 7, { align: 'center' })
    })

    y += hCab
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    caixa(margem, y, nomeW, hLinha)
    texto(func.nome, margem + 2, y + 5)
    texto(func.funcao, margem + 2, y + 9)

    diasBloco.forEach((d, idx) => {
      const x = margem + nomeW + idx * colW
      caixa(x, y, colW, hLinha)
      texto(d.raw || '-', x + colW / 2, y + 7.5, { align: 'center' })
    })

    ;[String(func.base), String(func.he50), String(func.he100), formatCurrency(func.total)].forEach((val, idx) => {
      const x = totaisX + idx * totalW
      caixa(x, y, totalW, hLinha)
      texto(val, x + totalW / 2, y + 7.5, { align: 'center' })
    })

    y += hLinha + 8
  }

  resumo.forEach((func) => {
    const bloco1 = func.diario.slice(0, 15)
    const bloco2 = func.diario.slice(15)
    desenharBlocoDias(func, bloco1, 'Dias 1 a 15')
    if (bloco2.length) desenharBlocoDias(func, bloco2, 'Dias 16 a 31')
  })

  doc.save(`relatorio-apontamento-detalhado-${ano}-${String(mes + 1).padStart(2, '0')}.pdf`)
}

export default function App() {
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth())
  const [funcionarios, setFuncionarios] = useState(funcionariosIniciais)
  const [feriados, setFeriados] = useState([])
  const [novoFeriado, setNovoFeriado] = useState('')
  const [novoFuncionario, setNovoFuncionario] = useState({ nome: '', funcao: '', valorHora: '' })
  const [lancamentos, setLancamentos] = useState({})
  const [aba, setAba] = useState('apontamento')

  useEffect(() => {
    const salvo = localStorage.getItem(STORAGE_KEY)
    if (salvo) {
      const d = JSON.parse(salvo)
      setAno(d.ano ?? hoje.getFullYear())
      setMes(d.mes ?? hoje.getMonth())
      setFuncionarios(d.funcionarios?.length ? d.funcionarios : funcionariosIniciais)
      setFeriados(d.feriados ?? [])
      setLancamentos(d.lancamentos ?? {})
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ano, mes, funcionarios, feriados, lancamentos }))
  }, [ano, mes, funcionarios, feriados, lancamentos])

  const dias = useMemo(() => getDaysInMonth(ano, mes), [ano, mes])

  const resumo = useMemo(() => funcionarios.map((func) => {
    let base = 0, he50 = 0, he100 = 0
    dias.forEach((dia) => {
      const raw = lancamentos[func.id]?.[dia.iso] || ''
      const especial = dia.semana === 0 || feriados.includes(dia.iso)
      const c = parseLancamento(raw, especial)
      base += c.base; he50 += c.he50; he100 += c.he100
    })
    const total = base * func.valorHora + he50 * func.valorHora * 1.5 + he100 * func.valorHora * 2
    return { ...func, base, he50, he100, total }
  }), [funcionarios, dias, lancamentos, feriados])

  const totais = resumo.reduce((acc, r) => {
    acc.base += r.base; acc.total += r.total; return acc
  }, { base: 0, total: 0 })

  function atualizarLancamento(funcId, dataIso, valor) {
    setLancamentos((prev) => ({ ...prev, [funcId]: { ...(prev[funcId] || {}), [dataIso]: valor } }))
  }

  function adicionarFuncionario() {
    if (!novoFuncionario.nome || !novoFuncionario.valorHora) return
    const id = crypto.randomUUID()
    setFuncionarios((prev) => [...prev, { id, nome: novoFuncionario.nome, funcao: novoFuncionario.funcao || '-', valorHora: Number(novoFuncionario.valorHora) }])
    setNovoFuncionario({ nome: '', funcao: '', valorHora: '' })
  }

  function removerFuncionario(id) {
    setFuncionarios((prev) => prev.filter((f) => f.id !== id))
  }

  function adicionarFeriado() {
    if (!novoFeriado || feriados.includes(novoFeriado)) return
    setFeriados((prev) => [...prev, novoFeriado].sort())
    setNovoFeriado('')
  }

  return <div className="container">
    <div className="hero">
      <div>
        <div className="smallcaps">PWA para Android</div>
        <h1>Apontamento de Funcionários</h1>
        <p>Controle diário no padrão da planilha: 9, 8+2, cálculo automático de HE 50% e HE 100%, backup local e instalação pela tela inicial.</p>
      </div>
      <div className="actions">
        <button className="btn" onClick={() => baixarBackupJSON({ ano, mes, funcionarios, feriados, lancamentos })}>Backup</button>
        <label className="btn">Importar<input hidden type="file" accept="application/json" onChange={(e) => {
          const f = e.target.files?.[0]; if (!f) return
          const r = new FileReader(); r.onload = () => {
            const d = JSON.parse(String(r.result || '{}'))
            setAno(d.ano ?? hoje.getFullYear()); setMes(d.mes ?? hoje.getMonth()); setFuncionarios(d.funcionarios ?? funcionariosIniciais); setFeriados(d.feriados ?? []); setLancamentos(d.lancamentos ?? {})
          }; r.readAsText(f)
        }} /></label>
        <button className="btn primary" onClick={() => gerarPDFDetalhado({ ano, mes, funcionarios, dias, lancamentos, feriados })}>Exportar PDF</button>
      </div>
    </div>

    <div className="grid">
      <div className="card stat"><div className="label">Funcionários</div><div className="value">{funcionarios.length}</div></div>
      <div className="card stat"><div className="label">Mês</div><div className="value">{MESES[mes]}</div></div>
      <div className="card stat"><div className="label">Horas base</div><div className="value">{totais.base}</div></div>
      <div className="card stat"><div className="label">Total calculado</div><div className="value">{formatCurrency(totais.total)}</div></div>
      <div className="card stat"><div className="label">Status</div><div className="value" style={{fontSize: 18}}>Online</div></div>
    </div>

    <div className="tabs">
      {['apontamento','resumo','funcionarios','pwa'].map((t) => <button key={t} className={`tab ${aba===t?'active':''}`} onClick={() => setAba(t)}>{t==='apontamento'?'Apontamento':t==='resumo'?'Resumo':t==='funcionarios'?'Funcionários':'PWA e feriados'}</button>)}
    </div>

    {aba === 'apontamento' && <div className="card panel">
      <div className="title">Lançamento diário</div>
      <div className="controls">
        <div className="field"><label>Ano</label><input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value) || hoje.getFullYear())} /></div>
        <div className="field"><label>Mês</label><select value={mes} onChange={(e) => setMes(Number(e.target.value))}>{MESES.map((m,i)=><option key={m} value={i}>{m}</option>)}</select></div>
      </div>
      <div className="helper">Digite 9, 8+2, 7,5 ou deixe em branco. Domingo e feriado entram como 100% automaticamente.</div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Funcionário</th>{dias.map((dia) => <th key={dia.iso}>{dia.dia}<div className="muted">{dia.nomeSemana}</div>{(dia.semana===0||feriados.includes(dia.iso)) && <div className="day-badge">100%</div>}</th>)}</tr></thead><tbody>{funcionarios.map((func) => <tr key={func.id}><td><div className="emp-name">{func.nome}</div><div className="emp-role">{func.funcao} • {formatCurrency(func.valorHora)}/h</div></td>{dias.map((dia)=><td key={dia.iso}><input className="cell-input" value={lancamentos[func.id]?.[dia.iso] || ''} onChange={(e)=>atualizarLancamento(func.id,dia.iso,e.target.value)} /></td>)}</tr>)}</tbody></table></div>
    </div>}

    {aba === 'resumo' && <div className="card panel">
      <div className="title">Resumo mensal</div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Funcionário</th><th>Função</th><th>Valor/h</th><th>Base</th><th>HE 50%</th><th>HE 100%</th><th>Total</th></tr></thead><tbody>{resumo.map((r)=><tr key={r.id}><td>{r.nome}</td><td>{r.funcao}</td><td>{formatCurrency(r.valorHora)}</td><td>{r.base}</td><td>{r.he50}</td><td>{r.he100}</td><td>{formatCurrency(r.total)}</td></tr>)}</tbody></table></div>
    </div>}

    {aba === 'funcionarios' && <div className="two-col"><div className="card panel"><div className="title">Cadastro de funcionários</div><div className="list">{funcionarios.map((f)=><div className="item" key={f.id}><div><div className="emp-name" style={{fontSize:20}}>{f.nome}</div><div className="emp-role">{f.funcao} • {formatCurrency(f.valorHora)}/h</div></div><button className="btn" onClick={()=>removerFuncionario(f.id)}>Excluir</button></div>)}</div></div><div className="card panel"><div className="title">Novo funcionário</div><div className="field"><label>Nome</label><input value={novoFuncionario.nome} onChange={(e)=>setNovoFuncionario((p)=>({...p,nome:e.target.value}))} /></div><div className="field"><label>Função</label><input value={novoFuncionario.funcao} onChange={(e)=>setNovoFuncionario((p)=>({...p,funcao:e.target.value}))} /></div><div className="field"><label>Valor hora (R$)</label><input type="number" value={novoFuncionario.valorHora} onChange={(e)=>setNovoFuncionario((p)=>({...p,valorHora:e.target.value}))} /></div><div style={{height:10}} /><button className="btn primary" onClick={adicionarFuncionario}>Adicionar funcionário</button></div></div>}

    {aba === 'pwa' && <div className="two-col"><div className="card panel"><div className="title">Feriados</div><div className="row"><input className="field" type="date" value={novoFeriado} onChange={(e)=>setNovoFeriado(e.target.value)} /><button className="btn primary" onClick={adicionarFeriado}>Adicionar</button></div><div style={{height:14}} /><div className="list">{feriados.map((f)=><div className="item" key={f}><div>{f}</div></div>)}</div></div><div className="card panel"><div className="title">Como usar</div><div className="list"><div className="item"><div><strong>Exportação</strong><div className="muted">O botão do topo gera um PDF com resumo geral e detalhamento diário por funcionário.</div></div></div><div className="item"><div><strong>Backup</strong><div className="muted">Os dados ficam salvos no aparelho e podem ser exportados em JSON.</div></div></div><div className="item"><div><strong>Instalação</strong><div className="muted">No Android, abra no Chrome e use Adicionar à tela inicial.</div></div></div></div></div></div>}
  </div>
}
