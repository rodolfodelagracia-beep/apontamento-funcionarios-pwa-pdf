import React, { useEffect, useMemo, useState } from 'react'
import jsPDF from 'jspdf'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const STORAGE_KEY = 'apontamento-funcionarios-pdf-v3'

const funcionariosIniciais = [
  { id: '1', nome: 'Ademir', funcao: 'Serviços gerais', valorHora: 12 },
  { id: '2', nome: 'Marcos', funcao: 'Serviços gerais', valorHora: 12 },
]

const icone = {
  clock: '◷', people: '◉', money: 'R$', calendar: '▦', check: '✓', warning: '!', download: '↓', upload: '↑', plus: '+', trash: '×', edit: '✎', wifi: '●', search: '⌕',
}

function formatCurrency(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor || 0))
}

function formatHours(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function getDaysInMonth(ano, mes) {
  const total = new Date(ano, mes + 1, 0).getDate()
  return Array.from({ length: total }, (_, indice) => {
    const data = new Date(ano, mes, indice + 1)
    const iso = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(indice + 1).padStart(2, '0')}`
    return { dia: indice + 1, iso, semana: data.getDay(), nomeSemana: DIAS[data.getDay()] }
  })
}

function parseLancamento(raw, especial) {
  const texto = String(raw || '').trim().replace(/\s+/g, '')
  if (!texto) return { base: 0, he50: 0, he100: 0, valido: true }
  const numero = '^\\d+(?:[\\.,]\\d+)?$'
  if (new RegExp(numero).test(texto)) {
    const horas = Number(texto.replace(',', '.'))
    if (horas > 24) return { base: 0, he50: 0, he100: 0, valido: false }
    return especial ? { base: 0, he50: 0, he100: horas, valido: true } : { base: horas, he50: 0, he100: 0, valido: true }
  }
  const partes = texto.match(new RegExp(`^(${numero.slice(1, -1)})\\+(${numero.slice(1, -1)})$`))
  if (partes) {
    const normal = Number(partes[1].replace(',', '.'))
    const extra = Number(partes[2].replace(',', '.'))
    if (normal + extra > 24) return { base: 0, he50: 0, he100: 0, valido: false }
    return especial
      ? { base: 0, he50: 0, he100: normal + extra, valido: true }
      : { base: normal, he50: extra, he100: 0, valido: true }
  }
  return { base: 0, he50: 0, he100: 0, valido: false }
}

function calcularResumo(funcionarios, dias, lancamentos, feriados) {
  return funcionarios.map((funcionario) => {
    let base = 0
    let he50 = 0
    let he100 = 0
    let diasTrabalhados = 0
    let invalidos = 0
    const diario = dias.map((dia) => {
      const raw = lancamentos[funcionario.id]?.[dia.iso] || ''
      const especial = dia.semana === 0 || feriados.includes(dia.iso)
      const calculo = parseLancamento(raw, especial)
      base += calculo.base
      he50 += calculo.he50
      he100 += calculo.he100
      if (raw) diasTrabalhados += 1
      if (!calculo.valido) invalidos += 1
      return { ...dia, raw, especial, ...calculo }
    })
    const total = base * funcionario.valorHora + he50 * funcionario.valorHora * 1.5 + he100 * funcionario.valorHora * 2
    return { ...funcionario, base, he50, he100, total, diasTrabalhados, invalidos, diario }
  })
}

function baixarArquivo(conteudo, nome, tipo) {
  const blob = new Blob([conteudo], { type: tipo })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  link.click()
  URL.revokeObjectURL(url)
}

function gerarPDF({ ano, mes, resumo }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = 297
  const margem = 12
  let y = 16

  const cabecalho = (titulo) => {
    doc.setFillColor(15, 118, 110)
    doc.rect(0, 0, pageW, 8, 'F')
    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(17)
    doc.text(titulo, margem, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(71, 85, 105)
    doc.text(`${MESES[mes]} de ${ano} • Emitido em ${new Date().toLocaleDateString('pt-BR')}`, margem, y + 6)
    y += 14
  }

  cabecalho('Relatório de apontamento')
  const colunas = [margem, 76, 139, 170, 198, 225, 285]
  const titulos = ['Funcionário', 'Função', 'Horas base', 'HE 50%', 'HE 100%', 'Total']
  doc.setFillColor(241, 245, 249)
  doc.roundedRect(margem, y - 5, pageW - margem * 2, 10, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(51, 65, 85)
  titulos.forEach((titulo, i) => doc.text(titulo, colunas[i] + (i > 1 ? -2 : 2), y + 1, { align: i > 1 ? 'right' : 'left' }))
  y += 10
  doc.setFont('helvetica', 'normal')
  resumo.forEach((item) => {
    doc.setTextColor(15, 23, 42)
    doc.text(item.nome.slice(0, 28), colunas[0] + 2, y)
    doc.setTextColor(71, 85, 105)
    doc.text(item.funcao.slice(0, 27), colunas[1] + 2, y)
    ;[formatHours(item.base), formatHours(item.he50), formatHours(item.he100), formatCurrency(item.total)].forEach((valor, i) => {
      doc.text(valor, colunas[i + 2] - 2, y, { align: 'right' })
    })
    doc.setDrawColor(226, 232, 240)
    doc.line(margem, y + 3, pageW - margem, y + 3)
    y += 8
  })

  resumo.forEach((funcionario) => {
    doc.addPage()
    y = 16
    cabecalho(`${funcionario.nome} — detalhamento diário`)
    doc.setFontSize(10)
    doc.setTextColor(71, 85, 105)
    doc.text(`${funcionario.funcao} • ${formatCurrency(funcionario.valorHora)}/hora`, margem, y)
    y += 9
    const blocos = [funcionario.diario.slice(0, 16), funcionario.diario.slice(16)]
    blocos.filter(Boolean).forEach((bloco) => {
      if (!bloco.length) return
      const inicio = bloco[0].dia
      const fim = bloco[bloco.length - 1].dia
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(15, 23, 42)
      doc.text(`Dias ${inicio} a ${fim}`, margem, y)
      y += 6
      const w = (pageW - margem * 2) / bloco.length
      bloco.forEach((dia, i) => {
        const x = margem + i * w
        doc.setFillColor(dia.especial ? 254 : 248, dia.especial ? 243 : 250, dia.especial ? 199 : 252)
        doc.rect(x, y, w, 11, 'F')
        doc.setDrawColor(226, 232, 240)
        doc.rect(x, y, w, 24)
        doc.setFontSize(8)
        doc.setTextColor(71, 85, 105)
        doc.text(`${dia.dia} ${dia.nomeSemana}`, x + w / 2, y + 4, { align: 'center' })
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(15, 23, 42)
        doc.text(dia.raw || '—', x + w / 2, y + 18, { align: 'center' })
      })
      y += 32
    })
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    doc.text(`Base: ${formatHours(funcionario.base)}h    HE 50%: ${formatHours(funcionario.he50)}h    HE 100%: ${formatHours(funcionario.he100)}h`, margem, y)
    doc.setFont('helvetica', 'bold')
    doc.text(`Total: ${formatCurrency(funcionario.total)}`, pageW - margem, y, { align: 'right' })
  })

  doc.save(`apontamento-${ano}-${String(mes + 1).padStart(2, '0')}.pdf`)
}

function carregarEstado() {
  try {
    const atual = localStorage.getItem(STORAGE_KEY)
    const anterior = localStorage.getItem('apontamento-funcionarios-pdf-v2')
    const dados = JSON.parse(atual || anterior || '{}')
    return {
      funcionarios: dados.funcionarios?.length ? dados.funcionarios : funcionariosIniciais,
      feriados: Array.isArray(dados.feriados) ? dados.feriados : [],
      lancamentos: dados.lancamentos || {},
    }
  } catch {
    return { funcionarios: funcionariosIniciais, feriados: [], lancamentos: {} }
  }
}

export default function App() {
  const hoje = new Date()
  const inicial = useMemo(carregarEstado, [])
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth())
  const [funcionarios, setFuncionarios] = useState(inicial.funcionarios)
  const [feriados, setFeriados] = useState(inicial.feriados)
  const [lancamentos, setLancamentos] = useState(inicial.lancamentos)
  const [aba, setAba] = useState('apontamento')
  const [busca, setBusca] = useState('')
  const [novoFeriado, setNovoFeriado] = useState('')
  const [formFuncionario, setFormFuncionario] = useState({ nome: '', funcao: '', valorHora: '' })
  const [editando, setEditando] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [mensagem, setMensagem] = useState('')

  const dias = useMemo(() => getDaysInMonth(ano, mes), [ano, mes])
  const resumo = useMemo(() => calcularResumo(funcionarios, dias, lancamentos, feriados), [funcionarios, dias, lancamentos, feriados])
  const totais = useMemo(() => resumo.reduce((acc, item) => ({
    base: acc.base + item.base,
    he50: acc.he50 + item.he50,
    he100: acc.he100 + item.he100,
    total: acc.total + item.total,
    dias: acc.dias + item.diasTrabalhados,
    invalidos: acc.invalidos + item.invalidos,
  }), { base: 0, he50: 0, he100: 0, total: 0, dias: 0, invalidos: 0 }), [resumo])

  const filtrados = useMemo(() => funcionarios.filter((item) => `${item.nome} ${item.funcao}`.toLowerCase().includes(busca.toLowerCase())), [funcionarios, busca])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ funcionarios, feriados, lancamentos }))
  }, [funcionarios, feriados, lancamentos])

  useEffect(() => {
    const conectar = () => setOnline(true)
    const desconectar = () => setOnline(false)
    const prepararInstalacao = (evento) => { evento.preventDefault(); setInstallPrompt(evento) }
    window.addEventListener('online', conectar)
    window.addEventListener('offline', desconectar)
    window.addEventListener('beforeinstallprompt', prepararInstalacao)
    return () => {
      window.removeEventListener('online', conectar)
      window.removeEventListener('offline', desconectar)
      window.removeEventListener('beforeinstallprompt', prepararInstalacao)
    }
  }, [])

  const avisar = (texto) => {
    setMensagem(texto)
    window.setTimeout(() => setMensagem(''), 2600)
  }

  const atualizarLancamento = (funcionarioId, data, valor) => {
    setLancamentos((anterior) => ({ ...anterior, [funcionarioId]: { ...(anterior[funcionarioId] || {}), [data]: valor } }))
  }

  const preencherDiasUteis = () => {
    setLancamentos((anterior) => {
      const proximo = { ...anterior }
      funcionarios.forEach((funcionario) => {
        const valores = { ...(proximo[funcionario.id] || {}) }
        dias.forEach((dia) => {
          const especial = dia.semana === 0 || dia.semana === 6 || feriados.includes(dia.iso)
          if (!especial && !valores[dia.iso]) valores[dia.iso] = '8'
        })
        proximo[funcionario.id] = valores
      })
      return proximo
    })
    avisar('Dias úteis vazios preenchidos com 8 horas.')
  }

  const limparCompetencia = () => {
    if (!window.confirm(`Apagar todos os lançamentos de ${MESES[mes]} de ${ano}?`)) return
    const datas = new Set(dias.map((dia) => dia.iso))
    setLancamentos((anterior) => Object.fromEntries(Object.entries(anterior).map(([id, valores]) => [id, Object.fromEntries(Object.entries(valores).filter(([data]) => !datas.has(data)))])))
    avisar('Lançamentos do mês removidos.')
  }

  const salvarFuncionario = () => {
    const nome = formFuncionario.nome.trim()
    const valorHora = Number(String(formFuncionario.valorHora).replace(',', '.'))
    if (!nome || !valorHora || valorHora <= 0) return avisar('Informe nome e um valor/hora válido.')
    const dados = { nome, funcao: formFuncionario.funcao.trim() || 'Sem função informada', valorHora }
    if (editando) {
      setFuncionarios((anterior) => anterior.map((item) => item.id === editando ? { ...item, ...dados } : item))
      avisar('Funcionário atualizado.')
    } else {
      setFuncionarios((anterior) => [...anterior, { id: crypto.randomUUID(), ...dados }])
      avisar('Funcionário adicionado.')
    }
    setEditando(null)
    setFormFuncionario({ nome: '', funcao: '', valorHora: '' })
  }

  const iniciarEdicao = (funcionario) => {
    setEditando(funcionario.id)
    setFormFuncionario({ nome: funcionario.nome, funcao: funcionario.funcao, valorHora: funcionario.valorHora })
  }

  const removerFuncionario = (funcionario) => {
    if (!window.confirm(`Excluir ${funcionario.nome} e seus lançamentos?`)) return
    setFuncionarios((anterior) => anterior.filter((item) => item.id !== funcionario.id))
    setLancamentos((anterior) => { const proximo = { ...anterior }; delete proximo[funcionario.id]; return proximo })
    avisar('Funcionário excluído.')
  }

  const exportarBackup = () => {
    baixarArquivo(JSON.stringify({ versao: 3, exportadoEm: new Date().toISOString(), funcionarios, feriados, lancamentos }, null, 2), `backup-apontamento-${new Date().toISOString().slice(0, 10)}.json`, 'application/json')
    avisar('Backup exportado.')
  }

  const importarBackup = (arquivo) => {
    if (!arquivo) return
    const leitor = new FileReader()
    leitor.onload = () => {
      try {
        const dados = JSON.parse(String(leitor.result || '{}'))
        if (!Array.isArray(dados.funcionarios) || typeof dados.lancamentos !== 'object') throw new Error()
        setFuncionarios(dados.funcionarios)
        setFeriados(Array.isArray(dados.feriados) ? dados.feriados : [])
        setLancamentos(dados.lancamentos || {})
        avisar('Backup importado com sucesso.')
      } catch {
        avisar('Arquivo de backup inválido.')
      }
    }
    leitor.readAsText(arquivo)
  }

  const instalar = async () => {
    if (!installPrompt) return avisar('Use o menu do navegador e escolha “Instalar aplicativo”.')
    await installPrompt.prompt()
    setInstallPrompt(null)
  }

  const tabs = [
    ['apontamento', 'Apontamento'], ['resumo', 'Resumo mensal'], ['funcionarios', 'Equipe'], ['configuracoes', 'Feriados e dados'],
  ]

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">AF</div>
        <div><strong>Aponta Fácil</strong><span>Gestão de horas</span></div>
      </div>
      <div className={`connection ${online ? 'online' : 'offline'}`}><span>{icone.wifi}</span>{online ? 'Dados salvos' : 'Modo offline'}</div>
    </header>

    <main className="container">
      <section className="welcome">
        <div>
          <span className="eyebrow">CONTROLE MENSAL</span>
          <h1>Apontamento de funcionários</h1>
          <p>Registre jornadas, calcule horas extras e feche o mês com segurança.</p>
        </div>
        <div className="welcome-actions">
          <button className="btn secondary" onClick={exportarBackup}>{icone.download} Backup</button>
          <label className="btn secondary">{icone.upload} Importar<input hidden type="file" accept="application/json" onChange={(e) => importarBackup(e.target.files?.[0])} /></label>
          <button className="btn primary" onClick={() => gerarPDF({ ano, mes, resumo })}>{icone.download} Exportar PDF</button>
        </div>
      </section>

      <section className="metrics">
        <article className="metric"><span className="metric-icon teal">{icone.people}</span><div><small>Funcionários</small><strong>{funcionarios.length}</strong><em>na equipe</em></div></article>
        <article className="metric"><span className="metric-icon blue">{icone.clock}</span><div><small>Horas base</small><strong>{formatHours(totais.base)}h</strong><em>{formatHours(totais.he50 + totais.he100)}h extras</em></div></article>
        <article className="metric"><span className="metric-icon amber">{icone.calendar}</span><div><small>Dias apontados</small><strong>{totais.dias}</strong><em>lançamentos no mês</em></div></article>
        <article className="metric highlight"><span className="metric-icon green">{icone.money}</span><div><small>Total calculado</small><strong>{formatCurrency(totais.total)}</strong><em>{totais.invalidos ? `${totais.invalidos} pendência(s)` : 'Tudo conferido'}</em></div></article>
      </section>

      <nav className="tabs" aria-label="Navegação principal">
        {tabs.map(([id, titulo]) => <button key={id} className={aba === id ? 'active' : ''} onClick={() => setAba(id)}>{titulo}</button>)}
      </nav>

      {aba === 'apontamento' && <section className="panel">
        <div className="panel-heading">
          <div><span className="eyebrow">COMPETÊNCIA</span><h2>{MESES[mes]} de {ano}</h2></div>
          <div className="period-controls">
            <select aria-label="Mês" value={mes} onChange={(e) => setMes(Number(e.target.value))}>{MESES.map((nome, indice) => <option key={nome} value={indice}>{nome}</option>)}</select>
            <input aria-label="Ano" type="number" min="2020" max="2100" value={ano} onChange={(e) => setAno(Number(e.target.value) || hoje.getFullYear())} />
          </div>
        </div>
        <div className="toolbar">
          <div className="tip"><strong>Como lançar:</strong> use <code>8</code> para horas normais ou <code>8+2</code> para 8h normais + 2h extras.</div>
          <div className="toolbar-actions"><button className="btn ghost" onClick={preencherDiasUteis}>Preencher úteis (8h)</button><button className="btn danger-ghost" onClick={limparCompetencia}>Limpar mês</button></div>
        </div>
        <div className="table-wrap schedule-wrap">
          <table className="schedule-table">
            <thead><tr><th className="employee-column">Funcionário</th>{dias.map((dia) => {
              const especial = dia.semana === 0 || feriados.includes(dia.iso)
              return <th key={dia.iso} className={especial ? 'special-day' : dia.semana === 6 ? 'weekend' : ''}><span>{dia.nomeSemana}</span><strong>{dia.dia}</strong>{especial && <i>100%</i>}</th>
            })}<th className="total-column">Total</th></tr></thead>
            <tbody>{resumo.map((funcionario) => <tr key={funcionario.id}>
              <td className="employee-column"><strong>{funcionario.nome}</strong><span>{funcionario.funcao}</span></td>
              {funcionario.diario.map((dia) => <td key={dia.iso} className={dia.especial ? 'special-day' : dia.semana === 6 ? 'weekend' : ''}>
                <input aria-label={`${funcionario.nome}, dia ${dia.dia}`} className={dia.valido ? '' : 'invalid'} inputMode="decimal" placeholder="—" value={dia.raw} onChange={(e) => atualizarLancamento(funcionario.id, dia.iso, e.target.value)} title={dia.valido ? '' : 'Use 8 ou 8+2, com no máximo 24 horas'} />
              </td>)}
              <td className="total-column"><strong>{formatHours(funcionario.base + funcionario.he50 + funcionario.he100)}h</strong><span>{formatCurrency(funcionario.total)}</span></td>
            </tr>)}</tbody>
          </table>
        </div>
        {totais.invalidos > 0 && <div className="alert">{icone.warning} Há {totais.invalidos} lançamento(s) inválido(s). Corrija os campos destacados antes de exportar.</div>}
      </section>}

      {aba === 'resumo' && <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">FECHAMENTO</span><h2>Resumo de {MESES[mes]}</h2></div><button className="btn primary" onClick={() => gerarPDF({ ano, mes, resumo })}>Gerar relatório em PDF</button></div>
        <div className="summary-grid">
          {resumo.map((item) => <article className="summary-card" key={item.id}>
            <div className="avatar">{item.nome.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}</div>
            <div className="summary-person"><strong>{item.nome}</strong><span>{item.funcao} • {formatCurrency(item.valorHora)}/h</span></div>
            <div className="summary-numbers"><div><small>Base</small><strong>{formatHours(item.base)}h</strong></div><div><small>HE 50%</small><strong>{formatHours(item.he50)}h</strong></div><div><small>HE 100%</small><strong>{formatHours(item.he100)}h</strong></div><div className="pay"><small>A receber</small><strong>{formatCurrency(item.total)}</strong></div></div>
          </article>)}
        </div>
        <div className="grand-total"><span>Total da competência</span><strong>{formatCurrency(totais.total)}</strong></div>
      </section>}

      {aba === 'funcionarios' && <section className="split-layout">
        <div className="panel">
          <div className="panel-heading"><div><span className="eyebrow">EQUIPE</span><h2>{funcionarios.length} funcionários</h2></div><div className="search"><span>{icone.search}</span><input placeholder="Buscar funcionário" value={busca} onChange={(e) => setBusca(e.target.value)} /></div></div>
          <div className="employee-list">{filtrados.map((funcionario) => <article className="employee-item" key={funcionario.id}>
            <div className="avatar">{funcionario.nome.slice(0, 2).toUpperCase()}</div><div><strong>{funcionario.nome}</strong><span>{funcionario.funcao}</span></div><b>{formatCurrency(funcionario.valorHora)}/h</b>
            <div className="icon-actions"><button title="Editar" onClick={() => iniciarEdicao(funcionario)}>{icone.edit}</button><button className="delete" title="Excluir" onClick={() => removerFuncionario(funcionario)}>{icone.trash}</button></div>
          </article>)}</div>
          {!filtrados.length && <div className="empty">Nenhum funcionário encontrado.</div>}
        </div>
        <aside className="panel form-panel">
          <span className="eyebrow">{editando ? 'EDITAR CADASTRO' : 'NOVO CADASTRO'}</span><h2>{editando ? 'Atualizar funcionário' : 'Adicionar funcionário'}</h2>
          <label>Nome completo<input autoFocus value={formFuncionario.nome} onChange={(e) => setFormFuncionario((p) => ({ ...p, nome: e.target.value }))} placeholder="Ex.: João da Silva" /></label>
          <label>Função<input value={formFuncionario.funcao} onChange={(e) => setFormFuncionario((p) => ({ ...p, funcao: e.target.value }))} placeholder="Ex.: Operador" /></label>
          <label>Valor por hora<div className="money-input"><span>R$</span><input inputMode="decimal" value={formFuncionario.valorHora} onChange={(e) => setFormFuncionario((p) => ({ ...p, valorHora: e.target.value }))} placeholder="0,00" /></div></label>
          <button className="btn primary full" onClick={salvarFuncionario}>{editando ? 'Salvar alterações' : `${icone.plus} Adicionar à equipe`}</button>
          {editando && <button className="btn ghost full" onClick={() => { setEditando(null); setFormFuncionario({ nome: '', funcao: '', valorHora: '' }) }}>Cancelar edição</button>}
        </aside>
      </section>}

      {aba === 'configuracoes' && <section className="split-layout">
        <div className="panel">
          <span className="eyebrow">CALENDÁRIO</span><h2>Feriados e dias especiais</h2><p className="section-copy">Horas lançadas em domingos e feriados são calculadas automaticamente com adicional de 100%.</p>
          <div className="holiday-form"><input type="date" value={novoFeriado} onChange={(e) => setNovoFeriado(e.target.value)} /><button className="btn primary" onClick={() => { if (!novoFeriado || feriados.includes(novoFeriado)) return; setFeriados((p) => [...p, novoFeriado].sort()); setNovoFeriado(''); avisar('Feriado adicionado.') }}>{icone.plus} Adicionar</button></div>
          <div className="holiday-list">{feriados.length ? feriados.map((data) => <div key={data}><span className="metric-icon amber">{icone.calendar}</span><strong>{new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</strong><button title="Remover" onClick={() => setFeriados((p) => p.filter((item) => item !== data))}>{icone.trash}</button></div>) : <div className="empty">Nenhum feriado cadastrado.</div>}</div>
        </div>
        <aside className="panel">
          <span className="eyebrow">SEGURANÇA DOS DADOS</span><h2>Backup e instalação</h2>
          <div className="settings-list"><div><span className="metric-icon blue">{icone.download}</span><p><strong>Backup local</strong><small>Exporte todos os dados em um arquivo seguro.</small></p><button className="btn ghost" onClick={exportarBackup}>Exportar</button></div><div><span className="metric-icon teal">{icone.upload}</span><p><strong>Restaurar dados</strong><small>Importe um backup salvo anteriormente.</small></p><label className="btn ghost">Importar<input hidden type="file" accept="application/json" onChange={(e) => importarBackup(e.target.files?.[0])} /></label></div><div><span className="metric-icon green">{icone.check}</span><p><strong>Instalar aplicativo</strong><small>Use em tela cheia e continue trabalhando offline.</small></p><button className="btn ghost" onClick={instalar}>Instalar</button></div></div>
        </aside>
      </section>}
    </main>
    <footer><span>Aponta Fácil</span><span>Os dados ficam salvos somente neste dispositivo.</span></footer>
    {mensagem && <div className="toast">{icone.check} {mensagem}</div>}
  </div>
}
