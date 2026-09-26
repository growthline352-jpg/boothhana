import type {ReactNode} from 'react'
import { UnsavedChangesProvider } from '../visit/UnsavedChanges'
import './support.css'
export function SupportBoundary({children}:{children:ReactNode}){return <UnsavedChangesProvider>{children}</UnsavedChangesProvider>}
