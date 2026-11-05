import axios from 'axios'

export interface Cat {
  id: number
  name: string
  age: number
  color: string
}

export type CatInput = Omit<Cat, 'id'>

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/cats',
})

export const getCats = async (): Promise<Cat[]> => (await client.get<Cat[]>('/')).data

export const createCat = async (cat: CatInput): Promise<Cat> =>
  (await client.post<Cat>('/', cat)).data

export const updateCat = async (id: number, cat: CatInput): Promise<Cat> =>
  (await client.put<Cat>(`/${id}`, cat)).data

export const deleteCat = async (id: number): Promise<void> => {
  await client.delete(`/${id}`)
}
