import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createCat, deleteCat, getCats, updateCat, type Cat } from './api/cats'
import './App.css'

interface CatForm {
  name: string
  age: string
  color: string
}

const emptyForm: CatForm = { name: '', age: '', color: '' }

function App() {
  const [cats, setCats] = useState<Cat[]>([])
  const [form, setForm] = useState<CatForm>(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadCats = useCallback(
    () =>
      getCats()
        .then((data) => {
          setCats(data)
          setError(null)
        })
        .catch(() => setError('Failed to load cats'))
        .finally(() => setLoading(false)),
    [],
  )

  useEffect(() => {
    loadCats()
  }, [loadCats])

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const input = {
      name: form.name.trim(),
      age: Number(form.age),
      color: form.color.trim(),
    }
    try {
      if (editingId === null) {
        await createCat(input)
      } else {
        await updateCat(editingId, input)
      }
      resetForm()
      await loadCats()
    } catch {
      setError(editingId === null ? 'Failed to add cat' : 'Failed to update cat')
    }
  }

  const handleEdit = (cat: Cat) => {
    setEditingId(cat.id)
    setForm({ name: cat.name, age: String(cat.age), color: cat.color })
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteCat(id)
      if (editingId === id) resetForm()
      await loadCats()
    } catch {
      setError('Failed to delete cat')
    }
  }

  return (
    <main className="cats">
      <h1>Cats</h1>

      {error && <p className="error">{error}</p>}

      <form onSubmit={handleSubmit} className="cat-form">
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          type="number"
          min="0"
          step="1"
          placeholder="Age"
          value={form.age}
          onChange={(e) => setForm({ ...form, age: e.target.value })}
          required
        />
        <input
          placeholder="Color"
          value={form.color}
          onChange={(e) => setForm({ ...form, color: e.target.value })}
          required
        />
        <button type="submit">{editingId === null ? 'Add' : 'Save'}</button>
        {editingId !== null && (
          <button type="button" onClick={resetForm}>
            Cancel
          </button>
        )}
      </form>

      {loading ? (
        <p>Loading...</p>
      ) : cats.length === 0 ? (
        <p>No cats yet.</p>
      ) : (
        <ul className="cat-list">
          {cats.map((cat) => (
            <li key={cat.id}>
              <span>
                <strong>{cat.name}</strong>, {cat.age} y.o., {cat.color}
              </span>
              <span className="actions">
                <button type="button" onClick={() => handleEdit(cat)}>
                  Edit
                </button>
                <button type="button" onClick={() => handleDelete(cat.id)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default App
