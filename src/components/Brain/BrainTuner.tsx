import { useState } from 'react'
import { DEFAULT_BRAIN_PARAMS, type BrainShapeParams, type Lobe } from './brainMesh'
import { DEFAULT_LOOK, type LookParams, type SculptSettings, type SculptTool } from './tunerState'

// ── dot-path get/set (handles nested objects + array indices) ──
/* eslint-disable @typescript-eslint/no-explicit-any */
const getPath = (obj: any, path: string) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)
const setPath = (obj: any, path: string, val: any) => {
  const ks = path.split('.'); const last = ks.pop()!
  let o = obj; for (const k of ks) o = o[k]
  o[last] = val
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Slider { path: string; label: string; min: number; max: number; step: number }

const SHAPE_SLIDERS: Slider[] = [
  { path: 'detail', label: 'detalle (vértices)', min: 1, max: 4, step: 0.1 },
  { path: 'ax', label: 'ancho (x)', min: 0.4, max: 1.4, step: 0.01 },
  { path: 'ay', label: 'alto (y)', min: 0.4, max: 1.4, step: 0.01 },
  { path: 'az', label: 'largo front-back (z)', min: 0.4, max: 1.6, step: 0.01 },
  { path: 'topDome', label: 'cúpula arriba', min: 0, max: 0.4, step: 0.01 },
  { path: 'bottomTaper', label: 'estrechar base', min: 0, max: 0.7, step: 0.01 },
  { path: 'baseFlatten', label: 'aplanar base', min: 0, max: 0.9, step: 0.01 },
  { path: 'bottomFlatten', label: 'achatar fondo', min: 0, max: 0.4, step: 0.01 },
  { path: 'fissureDepth', label: 'fisura prof.', min: 0, max: 0.4, step: 0.01 },
  { path: 'fissureWidth', label: 'fisura ancho', min: 0.05, max: 0.4, step: 0.01 },
  { path: 'hemisphereSpread', label: 'separar hemisf.', min: 0, max: 0.2, step: 0.01 },
  { path: 'temporalBulge', label: 'bulbo temporal', min: 0, max: 0.3, step: 0.01 },
  { path: 'noiseAmp', label: 'ruido amplitud', min: 0, max: 0.2, step: 0.005 },
  { path: 'noiseFreq', label: 'ruido frecuencia', min: 1, max: 5, step: 0.1 },
  { path: 'centerY', label: 'centro Y', min: -0.3, max: 0.2, step: 0.01 },
]
const ROTATION_SLIDERS: Slider[] = [
  { path: 'rotation.0', label: 'rotar X (cabeceo)', min: -180, max: 180, step: 1 },
  { path: 'rotation.1', label: 'rotar Y (giro)', min: -180, max: 180, step: 1 },
  { path: 'rotation.2', label: 'rotar Z (ladeo)', min: -180, max: 180, step: 1 },
]
const CEREBELLUM_SLIDERS: Slider[] = [
  { path: 'cerebellum.scale.0', label: 'cb ancho', min: 0.1, max: 0.6, step: 0.01 },
  { path: 'cerebellum.scale.1', label: 'cb alto', min: 0.1, max: 0.6, step: 0.01 },
  { path: 'cerebellum.scale.2', label: 'cb largo', min: 0.1, max: 0.6, step: 0.01 },
  { path: 'cerebellum.center.0', label: 'cb pos X', min: -0.6, max: 0.6, step: 0.01 },
  { path: 'cerebellum.center.1', label: 'cb pos Y', min: -1.1, max: 0, step: 0.01 },
  { path: 'cerebellum.center.2', label: 'cb pos Z', min: -1.1, max: 0, step: 0.01 },
  { path: 'cerebellum.wrinkleAmp', label: 'cb arrugas', min: 0, max: 0.4, step: 0.01 },
  { path: 'cerebellum.detail', label: 'cb detalle', min: 1, max: 3, step: 1 },
]
const STEM_SLIDERS: Slider[] = [
  { path: 'stem.strands', label: 'tronco hebras', min: 0, max: 6, step: 1 },
  { path: 'stem.points', label: 'tronco puntos', min: 2, max: 16, step: 1 },
  { path: 'stem.top.0', label: 'arriba X', min: -0.8, max: 0.8, step: 0.01 },
  { path: 'stem.top.1', label: 'arriba Y', min: -1.2, max: 0.2, step: 0.01 },
  { path: 'stem.top.2', label: 'arriba Z', min: -1.1, max: 0.6, step: 0.01 },
  { path: 'stem.bottom.0', label: 'abajo X', min: -0.8, max: 0.8, step: 0.01 },
  { path: 'stem.bottom.1', label: 'abajo Y', min: -1.8, max: -0.3, step: 0.01 },
  { path: 'stem.bottom.2', label: 'abajo Z', min: -1.1, max: 0.6, step: 0.01 },
  { path: 'stem.spread', label: 'tronco grosor', min: 0, max: 0.12, step: 0.005 },
]
const LOOK_SLIDERS: Slider[] = [
  { path: 'bloomStrength', label: 'bloom fuerza', min: 0, max: 1.2, step: 0.01 },
  { path: 'bloomRadius', label: 'bloom radio', min: 0, max: 1, step: 0.01 },
  { path: 'bloomThreshold', label: 'bloom umbral', min: 0, max: 1, step: 0.01 },
  { path: 'wireOpacity', label: 'líneas opacidad', min: 0, max: 0.6, step: 0.01 },
  { path: 'dotSize', label: 'nodos tamaño', min: 0, max: 0.1, step: 0.002 },
  { path: 'dotOpacity', label: 'nodos opacidad', min: 0, max: 1, step: 0.02 },
  { path: 'fogNear', label: 'fog cerca', min: 1, max: 8, step: 0.1 },
  { path: 'fogFar', label: 'fog lejos', min: 4, max: 16, step: 0.1 },
  { path: 'bgDarken', label: 'fondo oscurecer', min: 0, max: 1, step: 0.02 },
]

const LOBES: { key: Lobe; label: string }[] = [
  { key: 'frontal', label: 'frontal' },
  { key: 'parietal', label: 'parietal' },
  { key: 'temporal', label: 'temporal' },
  { key: 'occipital', label: 'occipital' },
]
const TOOLS: { key: SculptTool; label: string }[] = [
  { key: 'raise', label: 'Abultar' },
  { key: 'lower', label: 'Hundir' },
  { key: 'density', label: 'Densidad' },
]

interface Props {
  shape: BrainShapeParams
  look: LookParams
  sculpt: SculptSettings
  onShape: (s: BrainShapeParams) => void
  onLook: (l: LookParams) => void
  onSculpt: (s: SculptSettings) => void
}

export function BrainTuner({ shape, look, sculpt, onShape, onLook, onSculpt }: Props) {
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)

  const hasInner = shape.shells.length > 1
  const innerScale = shape.shells[1] ?? 0.6

  const setShapePath = (path: string, val: number) => {
    const next = structuredClone(shape)
    setPath(next, path, val)
    onShape(next)
  }
  const setLookPath = (path: string, val: number) => {
    onLook({ ...look, [path]: val })
  }
  const setShells = (inner: boolean, scale: number) => {
    const next = structuredClone(shape)
    next.shells = inner ? [1, scale] : [1]
    onShape(next)
  }
  const setLobe = (lobe: Lobe, key: 'scale' | 'density', val: number) => {
    const next = structuredClone(shape)
    next.lobes[lobe][key] = val
    onShape(next)
  }
  const deleteBulge = (i: number) => { const n = structuredClone(shape); n.bulges.splice(i, 1); onShape(n) }
  const deleteDensity = (i: number) => { const n = structuredClone(shape); n.densityPoints.splice(i, 1); onShape(n) }
  const clearSculpt = () => { const n = structuredClone(shape); n.bulges = []; n.densityPoints = []; onShape(n) }
  const setSc = (patch: Partial<SculptSettings>) => onSculpt({ ...sculpt, ...patch })

  const renderSliders = (sliders: Slider[], obj: BrainShapeParams | LookParams, onSet: (p: string, v: number) => void) =>
    sliders.map((s) => {
      const val = Number(getPath(obj, s.path) ?? 0)
      return (
        <label key={s.path} style={row}>
          <span style={lbl}>{s.label}</span>
          <input
            type="range" min={s.min} max={s.max} step={s.step} value={val}
            onChange={(e) => onSet(s.path, Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={num}>{s.step >= 1 ? val.toFixed(0) : val.toFixed(2)}</span>
        </label>
      )
    })

  const copy = () => {
    const out = JSON.stringify({ shape, look }, null, 2)
    void navigator.clipboard.writeText(out)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  const reset = () => {
    onShape(structuredClone(DEFAULT_BRAIN_PARAMS))
    onLook({ ...DEFAULT_LOOK })
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...fab }} title="Abrir ajustes del cerebro">⚙︎</button>
    )
  }

  return (
    <div style={panel}>
      <div style={header}>
        <span style={{ fontWeight: 700 }}>🧠 Brain Tuner</span>
        <button onClick={() => setOpen(false)} style={iconBtn} title="Minimizar">–</button>
      </div>
      <div style={scroll}>
        <div style={section}>forma · cerebro</div>
        {renderSliders(SHAPE_SLIDERS, shape, setShapePath)}

        <div style={section}>orientación (rotar todo)</div>
        {renderSliders(ROTATION_SLIDERS, shape, setShapePath)}

        <div style={section}>capa interior</div>
        <label style={row}>
          <span style={lbl}>capa interior</span>
          <input type="checkbox" checked={hasInner} onChange={(e) => setShells(e.target.checked, innerScale)} />
          <span style={num}>{hasInner ? 'on' : 'off'}</span>
        </label>
        {hasInner && (
          <label style={row}>
            <span style={lbl}>interior escala</span>
            <input type="range" min={0.3} max={0.85} step={0.01} value={innerScale}
              onChange={(e) => setShells(true, Number(e.target.value))} style={{ flex: 1 }} />
            <span style={num}>{innerScale.toFixed(2)}</span>
          </label>
        )}

        <div style={section}>lóbulos (zona)</div>
        {LOBES.map(({ key, label }) => (
          <div key={key}>
            <div style={lobeHead}>{label}</div>
            <label style={row}>
              <span style={lbl}>· tamaño</span>
              <input type="range" min={0.6} max={1.4} step={0.01} value={shape.lobes[key].scale}
                onChange={(e) => setLobe(key, 'scale', Number(e.target.value))} style={{ flex: 1 }} />
              <span style={num}>{shape.lobes[key].scale.toFixed(2)}</span>
            </label>
            <label style={row}>
              <span style={lbl}>· densidad</span>
              <input type="range" min={0} max={2} step={1} value={shape.lobes[key].density}
                onChange={(e) => setLobe(key, 'density', Number(e.target.value))} style={{ flex: 1 }} />
              <span style={num}>{shape.lobes[key].density}</span>
            </label>
          </div>
        ))}

        <div style={section}>cerebelo</div>
        {renderSliders(CEREBELLUM_SLIDERS, shape, setShapePath)}

        <div style={section}>tronco</div>
        {renderSliders(STEM_SLIDERS, shape, setShapePath)}

        <div style={section}>escultura (clic en la malla)</div>
        <label style={row}>
          <span style={lbl}>modo escultura</span>
          <input type="checkbox" checked={sculpt.enabled} onChange={(e) => setSc({ enabled: e.target.checked })} />
          <span style={num}>{sculpt.enabled ? 'on' : 'off'}</span>
        </label>
        <div style={{ display: 'flex', gap: 4, padding: '2px 0' }}>
          {TOOLS.map((t) => (
            <button key={t.key} onClick={() => setSc({ tool: t.key })}
              style={{ ...btn, padding: '4px', background: sculpt.tool === t.key ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.08)' }}>
              {t.label}
            </button>
          ))}
        </div>
        <label style={row}>
          <span style={lbl}>radio</span>
          <input type="range" min={0.15} max={1.5} step={0.05} value={sculpt.radius}
            onChange={(e) => setSc({ radius: Number(e.target.value) })} style={{ flex: 1 }} />
          <span style={num}>{sculpt.radius.toFixed(2)}</span>
        </label>
        {sculpt.tool === 'density' ? (
          <label style={row}>
            <span style={lbl}>nivel</span>
            <input type="range" min={1} max={2} step={1} value={sculpt.level}
              onChange={(e) => setSc({ level: Number(e.target.value) })} style={{ flex: 1 }} />
            <span style={num}>{sculpt.level}</span>
          </label>
        ) : (
          <label style={row}>
            <span style={lbl}>fuerza</span>
            <input type="range" min={0.02} max={0.5} step={0.01} value={sculpt.strength}
              onChange={(e) => setSc({ strength: Number(e.target.value) })} style={{ flex: 1 }} />
            <span style={num}>{sculpt.strength.toFixed(2)}</span>
          </label>
        )}
        {(shape.bulges.length + shape.densityPoints.length) > 0 && (
          <>
            <div style={{ ...section, marginTop: 6 }}>puntos ({shape.bulges.length + shape.densityPoints.length})</div>
            {shape.bulges.map((b, i) => (
              <div key={`b${i}`} style={row}>
                <span style={ptLbl}>{b.strength >= 0 ? '▲ abultar' : '▼ hundir'} · r{b.radius.toFixed(1)}</span>
                <button onClick={() => deleteBulge(i)} style={delBtn} title="Borrar">×</button>
              </div>
            ))}
            {shape.densityPoints.map((d, i) => (
              <div key={`d${i}`} style={row}>
                <span style={ptLbl}>◆ densidad · n{d.level}</span>
                <button onClick={() => deleteDensity(i)} style={delBtn} title="Borrar">×</button>
              </div>
            ))}
            <button onClick={clearSculpt} style={{ ...btn, marginTop: 4 }}>Limpiar escultura</button>
          </>
        )}

        <div style={section}>aspecto (en vivo)</div>
        {renderSliders(LOOK_SLIDERS, look, setLookPath)}
      </div>
      <div style={footer}>
        <button onClick={copy} style={btn}>{copied ? '¡copiado!' : 'Copiar JSON'}</button>
        <button onClick={reset} style={btn}>Reset</button>
      </div>
    </div>
  )
}

// ── inline styles (self-contained dev tool) ──
const panel: React.CSSProperties = {
  position: 'absolute', top: 44, right: 8, width: 270, maxHeight: 'calc(100% - 96px)',
  display: 'flex', flexDirection: 'column', zIndex: 50,
  background: 'rgba(15,17,23,0.86)', color: '#e6e6ea', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, fontFamily: 'ui-monospace, monospace', fontSize: 11, backdropFilter: 'blur(4px)',
}
const header: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.1)',
}
const scroll: React.CSSProperties = { overflowY: 'auto', padding: '4px 8px' }
const section: React.CSSProperties = {
  margin: '8px 0 3px', fontSize: 10, opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.5,
}
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }
const lbl: React.CSSProperties = { width: 96, flexShrink: 0, opacity: 0.85 }
const num: React.CSSProperties = { width: 34, textAlign: 'right', opacity: 0.7, flexShrink: 0 }
const lobeHead: React.CSSProperties = { marginTop: 3, opacity: 0.7, fontSize: 10.5 }
const ptLbl: React.CSSProperties = { flex: 1, opacity: 0.85 }
const delBtn: React.CSSProperties = {
  cursor: 'pointer', background: 'rgba(255,80,80,0.15)', color: '#ffb4b4',
  border: '1px solid rgba(255,80,80,0.3)', borderRadius: 4, width: 20, height: 18, fontSize: 12, lineHeight: 1,
}
const footer: React.CSSProperties = {
  display: 'flex', gap: 6, padding: 8, borderTop: '1px solid rgba(255,255,255,0.1)',
}
const btn: React.CSSProperties = {
  flex: 1, padding: '5px 8px', cursor: 'pointer', borderRadius: 5,
  background: 'rgba(255,255,255,0.08)', color: '#e6e6ea', border: '1px solid rgba(255,255,255,0.15)',
  fontFamily: 'inherit', fontSize: 11,
}
const iconBtn: React.CSSProperties = {
  cursor: 'pointer', background: 'transparent', color: '#e6e6ea', border: 'none', fontSize: 14, lineHeight: 1,
}
const fab: React.CSSProperties = {
  position: 'absolute', top: 44, right: 8, zIndex: 50, width: 30, height: 30, cursor: 'pointer',
  borderRadius: 6, background: 'rgba(15,17,23,0.8)', color: '#e6e6ea',
  border: '1px solid rgba(255,255,255,0.15)', fontSize: 14,
}
