import React, { useState } from 'react';

interface Category {
  name: string;
  label: string;
}

const categories: Category[] = [
  { name: 'sector', label: 'Sector' },
  { name: 'emotion', label: 'Emotion' },
  { name: 'brand', label: 'Brand' },
  { name: 'demographics', label: 'Demographics' },
  { name: 'location', label: 'Location' },
];

const PlanCampaignForm: React.FC = () => {
  const [keywords, setKeywords] = useState<Record<string, string[]>>({
    sector: [],
    emotion: [],
    brand: [],
    demographics: [],
    location: [],
  });
  const [inputs, setInputs] = useState<Record<string, string>>({
    sector: '',
    emotion: '',
    brand: '',
    demographics: '',
    location: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, category: string) => {
    setInputs({ ...inputs, [category]: e.target.value });
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, category: string) => {
    if (e.key === 'Enter' && inputs[category].trim()) {
      e.preventDefault();
      if (!keywords[category].includes(inputs[category].trim())) {
        setKeywords({
          ...keywords,
          [category]: [...keywords[category], inputs[category].trim()],
        });
      }
      setInputs({ ...inputs, [category]: '' });
    }
  };

  const handleRemoveKeyword = (category: string, idx: number) => {
    setKeywords({
      ...keywords,
      [category]: keywords[category].filter((_, i) => i !== idx),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Submit logic
    console.log('Submitted keywords:', keywords);
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h2 style={styles.title}>Plan Campaign</h2>
      {categories.map((cat) => (
        <div key={cat.name} style={styles.categoryBox}>
          <label style={styles.label}>{cat.label}</label>
          <div style={styles.tagsContainer}>
            {keywords[cat.name].map((kw, idx) => (
              <span key={kw + idx} style={styles.tag}>
                {kw}
                <button
                  type="button"
                  style={styles.removeBtn}
                  onClick={() => handleRemoveKeyword(cat.name, idx)}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              value={inputs[cat.name]}
              onChange={(e) => handleInputChange(e, cat.name)}
              onKeyDown={(e) => handleInputKeyDown(e, cat.name)}
              placeholder={`Add ${cat.label}`}
              style={styles.input}
            />
          </div>
        </div>
      ))}
      <button type="submit" style={styles.submitBtn}>Submit</button>
    </form>
  );
};

const styles: Record<string, React.CSSProperties> = {
  form: {
    background: '#fff',
    borderRadius: 16,
    padding: 32,
    width: 340,
    margin: '0 auto',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  title: {
    margin: 0,
    marginBottom: 8,
    fontSize: 22,
    fontWeight: 700,
    textAlign: 'center',
  },
  categoryBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontWeight: 600,
    marginBottom: 4,
  },
  tagsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    minHeight: 36,
    background: '#f5f5f5',
    borderRadius: 8,
    padding: '6px 8px',
  },
  tag: {
    background: '#e0e7ff',
    color: '#3730a3',
    borderRadius: 12,
    padding: '4px 10px',
    display: 'flex',
    alignItems: 'center',
    fontSize: 14,
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#a1a1aa',
    marginLeft: 4,
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
  },
  input: {
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: 15,
    minWidth: 80,
    flex: 1,
  },
  submitBtn: {
    marginTop: 16,
    padding: '10px 0',
    borderRadius: 8,
    border: 'none',
    background: '#6366f1',
    color: '#fff',
    fontWeight: 700,
    fontSize: 16,
    cursor: 'pointer',
  },
};

export default PlanCampaignForm;