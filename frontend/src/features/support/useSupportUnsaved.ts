import { useId } from 'react'
import { useDirty } from '../visit/UnsavedChanges'
export function useUnsaved(dirty:boolean){const id=useId();return useDirty(`support:${id}`,false,dirty)}
