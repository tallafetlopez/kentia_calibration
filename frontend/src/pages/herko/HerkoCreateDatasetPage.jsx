import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { toast } from 'sonner'
import Stepper from '../../components/herko/Stepper'
import Button from '../../components/herko/Button'
import FormSelect from '../../components/herko/FormSelect'
import RadioButton from '../../components/herko/RadioButton'
import Checkbox from '../../components/herko/Checkbox'
import Card from '../../components/herko/Card'

const STEPS = [
  { label: 'Software Reference' },
  { label: 'Creation Mode' },
  { label: 'Deployment Context' },
]

const CREATION_MODES = [
  { value: 'IMPORT_S37', label: 'Import S37 file' },
  { value: 'COPY_EXISTING', label: 'Copy existing dataset' },
  { value: 'MERGE', label: 'Merge calibration sources' },
  { value: 'REUSE_BASELINE', label: 'Reuse as baseline (DS remains linked)' },
]

const CONTEXTS = ['DEVELOPMENT', 'PRODUCTION', 'VARIANT_SPECIFIC', 'POST_SALES', 'VIN_SPECIFIC']

export default function HerkoCreateDatasetPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [swReleases, setSwReleases] = useState([])
  const [form, setForm] = useState({
    software_release_id: '',
    dataset_name: '',
    creation_mode: 'IMPORT_S37',
    deployment_context: '',
    baseline_dataset_id: null,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/software-releases').then(r => setSwReleases(r.data)).catch(() => {})
  }, [])

  const handleNext = () => {
    if (step === 1 && !form.software_release_id) { toast.error('Select a SW Release'); return }
    if (step === 2 && !form.creation_mode) { toast.error('Select a creation mode'); return }
    if (step < 3) setStep(s => s + 1)
  }

  const handleSubmit = async () => {
    if (!form.deployment_context) { toast.error('Select a deployment context'); return }
    if (!form.dataset_name) { toast.error('Enter a dataset name'); return }
    setSaving(true)
    try {
      const res = await api.post('/datasets', form)
      toast.success('Dataset created')
      navigate(`/herko/datasets/${res.data.id}`)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="herko-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/herko/datasets')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2D5016', fontSize: 14, fontWeight: 600 }}>
          ← Datasets
        </button>
        <span style={{ color: '#CCCCCC' }}>/</span>
        <h2 style={{ margin: 0 }}>New Dataset</h2>
      </div>

      <Stepper steps={STEPS} currentStep={step} />

      <Card>
        {step === 1 && (
          <div>
            <h3>Software Reference</h3>
            <p style={{ color: '#666666', fontSize: 13, marginBottom: 20 }}>Select the SW Release this dataset will be calibrated against.</p>
            <div style={{ maxWidth: 400 }}>
              <FormSelect
                label="SW Release"
                name="software_release_id"
                value={form.software_release_id}
                required
                onChange={e => setForm(f => ({ ...f, software_release_id: e.target.value }))}
                options={[
                  { label: '— Select SW Release —', value: '' },
                  ...swReleases.map(sr => ({ label: sr.software_release_identifier + ' v' + sr.version, value: sr.id }))
                ]}
              />
              <div className="herko-form-group">
                <label className="herko-label">Dataset Name <span className="required">*</span></label>
                <input className="herko-input" placeholder="e.g. DS_Euro6_Prod_2025"
                  value={form.dataset_name} onChange={e => setForm(f => ({ ...f, dataset_name: e.target.value }))} />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h3>Creation Mode</h3>
            <p style={{ color: '#666666', fontSize: 13, marginBottom: 20 }}>Choose how this dataset will be initialised.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {CREATION_MODES.map(m => (
                <RadioButton key={m.value} name="creation_mode" label={m.label}
                  value={m.value} checked={form.creation_mode === m.value}
                  onChange={() => setForm(f => ({ ...f, creation_mode: m.value }))} />
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h3>Deployment Context</h3>
            <p style={{ color: '#666666', fontSize: 13, marginBottom: 20 }}>Select the deployment context for this dataset.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320 }}>
              {CONTEXTS.map(ctx => (
                <Checkbox key={ctx} label={ctx.replace(/_/g, ' ')}
                  checked={form.deployment_context === ctx}
                  onChange={() => setForm(f => ({ ...f, deployment_context: ctx }))} />
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 32, paddingTop: 16, borderTop: '1px solid #E5E5E5' }}>
          {step > 1 && <Button variant="secondary" onClick={() => setStep(s => s - 1)}>← Back</Button>}
          <div style={{ flex: 1 }} />
          <Button variant="secondary" onClick={() => navigate('/herko/datasets')}>Cancel</Button>
          {step < 3
            ? <Button variant="primary" onClick={handleNext}>Continue →</Button>
            : <Button variant="primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Creating…' : 'Create Dataset →'}
              </Button>
          }
        </div>
      </Card>
    </div>
  )
}
