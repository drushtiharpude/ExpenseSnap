import { PREDEFINED_CATEGORIES } from './categories.js'

/** Icon keys shared by built-in categories and custom category.iconId. */
export const CATEGORY_ICON_IDS = [
  'food',
  'transport',
  'housing',
  'utilities',
  'health',
  'shopping',
  'salary',
  'other',
]

const ICON_ID_SET = new Set(CATEGORY_ICON_IDS)

export const CATEGORY_ICON_OPTIONS = [
  { id: 'food', label: 'Food' },
  { id: 'transport', label: 'Transport' },
  { id: 'housing', label: 'Housing' },
  { id: 'utilities', label: 'Utilities' },
  { id: 'health', label: 'Health' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'salary', label: 'Salary' },
  { id: 'other', label: 'Other' },
]

export function isValidCategoryIconId(value) {
  return typeof value === 'string' && ICON_ID_SET.has(value)
}

/** Default icon when a stored custom category has no iconId (legacy data). */
export function defaultCategoryIconId(type) {
  return type === 'income' ? 'salary' : 'other'
}

/**
 * Resolve which icon glyph to render for a category reference on a transaction/budget row.
 * @param {string | undefined} categoryId
 * @param {Array<{ id: string, type?: string, iconId?: string }>} customCategories
 */
export function resolveCategoryIconId(categoryId, customCategories = []) {
  if (typeof categoryId !== 'string' || categoryId === '') return 'other'
  const predefined = PREDEFINED_CATEGORIES.find((category) => category.id === categoryId)
  if (predefined) {
    if (predefined.id === 'other') return 'other'
    if (predefined.type === 'income' && predefined.id === 'salary') return 'salary'
    return predefined.id
  }
  const custom = customCategories.find((category) => category.id === categoryId)
  if (custom && isValidCategoryIconId(custom.iconId)) return custom.iconId
  if (custom?.type === 'income') return 'salary'
  return 'other'
}
