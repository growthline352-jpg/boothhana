import type { ReactElement,ReactNode } from 'react'
import { beforeEach,describe,expect,it,vi } from 'vitest'
import { SaveButton } from './SaveButton'
import { MemoryEditor } from './LibraryPage'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import type { MemoryEntry,MemoryIndex,MemoryTarget } from './types'

const f=vi.hoisted(()=>({cells:[] as unknown[],cursor:0,owner:'member:1',loading:false,index:[] as MemoryIndex[],remove:vi.fn(),save:vi.fn()}))
vi.mock('react',async original=>({...await original<typeof import('react')>(),useEffect:()=>{},
 useState:(value:unknown)=>{const n=f.cursor++;if(!(n in f.cells))f.cells[n]=value;return [f.cells[n],(next:unknown)=>{f.cells[n]=next}]},
 useRef:(value:unknown)=>{const n=f.cursor++;if(!(n in f.cells))f.cells[n]={current:value};return f.cells[n]},
}))
vi.mock('react-router',()=>({Link:'a'}))
vi.mock('../../app/useAuth',()=>({useAuth:()=>({refresh:vi.fn()})}))
vi.mock('./LibraryProvider',()=>({useLibrary:()=>({owner:f.owner,loading:f.loading,index:f.index,remove:f.remove,save:f.save})}))
vi.mock('../../components/ui/ConfirmDialog',()=>({ConfirmDialog:()=>null}))
vi.mock('../visit/UnsavedChanges',()=>({useDirty:()=>vi.fn()}))
type Node=ReactElement<Record<string,unknown>>
function nodes(value:ReactNode):Node[]{if(Array.isArray(value))return value.flatMap(nodes);if(!value||typeof value!=='object'||!('props' in value))return [];const n=value as Node;return [n,...nodes(n.props.children as ReactNode)]}
const target:MemoryTarget={type:'PRODUCT',eventId:4,id:572,participantId:500}
const row:MemoryIndex={id:'saved-item',revision:1,target,day:'',hall:'',visitedDays:[]}
function render(){f.cursor=0;return nodes(SaveButton({target}))}
function clickSave(){(render().find(n=>n.props['aria-pressed']!==undefined)!.props.onClick as ()=>void)()}
function dialog(){return render().find(n=>n.type===ConfirmDialog)}
async function confirm(){await (dialog()!.props.confirm as ()=>void)();await Promise.resolve();await Promise.resolve()}
beforeEach(()=>{f.cells=[];f.cursor=0;f.owner='member:1';f.loading=false;f.index=[row];f.remove.mockReset().mockResolvedValue(undefined);f.save.mockReset().mockResolvedValue(undefined)})
describe('bookmark removal confirmation',()=>{
 it('waits for confirmation and cancellation preserves the saved item',()=>{
  clickSave();expect(dialog()).toBeDefined();expect(f.remove).not.toHaveBeenCalled()
  ;(dialog()!.props.cancel as ()=>void)();expect(dialog()).toBeUndefined();expect(f.remove).not.toHaveBeenCalled()
 })
 it('removes exactly the confirmed row and prevents duplicate submissions',async()=>{
  let finish!:()=>void;f.remove.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve}))
  clickSave();void confirm();void confirm();expect(f.remove).toHaveBeenCalledTimes(1);expect(f.remove).toHaveBeenCalledWith(row)
  finish();await Promise.resolve();await Promise.resolve();expect(dialog()).toBeUndefined()
 })
 it('never deletes a newer revision without another confirmation',async()=>{
  clickSave();f.index=[{...row,revision:2}];await confirm();expect(f.remove).not.toHaveBeenCalled();expect(dialog()).toBeUndefined()
 })
 it('hides a previous account confirmation immediately',()=>{
  clickSave();f.owner='member:2';expect(dialog()).toBeUndefined();expect(f.remove).not.toHaveBeenCalled()
 })
 it('keeps failures visible and permits a retry',async()=>{
  f.remove.mockRejectedValueOnce(new Error('일시적인 오류'));clickSave();await confirm()
  expect(dialog()!.props.error).toBe('일시적인 오류');expect(dialog()!.props.busy).toBe(false)
  await confirm();expect(f.remove).toHaveBeenCalledTimes(2);expect(dialog()).toBeUndefined()
 })
 it('saves a new item directly without removal confirmation',async()=>{
  f.index=[];clickSave();await Promise.resolve();expect(f.save).toHaveBeenCalledWith({target,day:'',hall:''});expect(dialog()).toBeUndefined()
 })
})

describe('memory editor confirmations',()=>{
 const entry:MemoryEntry={...row,available:false,current:null,image:null,saved:null,note:'기존 메모',savedAt:'2026-10-09',updatedAt:'2026-10-09',changed:false,lastOpenedAt:null}
 const close=vi.fn()
 function editor(dirty=false){f.cursor=0;return nodes(MemoryEditor({entry,guest:false,trigger:null,close,draft:dirty?{id:entry.id,revision:entry.revision,note:'수정 중',day:'',hall:''}:undefined}))}
 it('keeps an unsaved draft when discard is cancelled',()=>{
  const tree=editor(true);(tree.find(n=>n.props['aria-label']==='닫기')!.props.onClick as ()=>void)()
  const confirmation=editor(true).find(n=>n.type===ConfirmDialog)!
  expect(confirmation.props.confirmLabel).toBe('저장하지 않고 닫기')
  close.mockClear();(confirmation.props.cancel as ()=>void)()
  expect(close).not.toHaveBeenCalled();expect(editor(true).find(n=>n.type==='textarea')!.props.value).toBe('수정 중')
 })
 it('deletes only after explicitly confirming inside the editor',async()=>{
  const tree=editor();(tree.find(n=>n.type==='button'&&n.props.children==='저장 항목 삭제')!.props.onClick as ()=>void)()
  expect(f.remove).not.toHaveBeenCalled();close.mockClear()
  ;(editor().find(n=>n.type===ConfirmDialog)!.props.confirm as ()=>void)()
  await Promise.resolve();await Promise.resolve()
  expect(f.remove).toHaveBeenCalledWith(entry);expect(close).toHaveBeenCalledOnce()
 })
})
