import { describe, expect, it } from 'vitest'
import type { BoothNotice, BoothSummary, EventSummary, PosSale } from '../../types'
import { eventBoothLabel, eventDates, noticeTargetsBooth, saleBoothLabel, salesForBooth } from './context'
import { readTarget, supportPath, supportTemplate } from '../support/rules'

const notice = { id: 401, eventBoothId: 201, title: '10월 공지', body: '안내', pinned: false, createdAt: '' } satisfies BoothNotice
const booth = (id: number, eventId: number) => ({ id, eventId, name: '같은 공방', boothNumber: 'A1' }) as BoothSummary
const events = [{ id: 101, name: '10월 행사' }, { id: 102, name: '11월 행사' }] as EventSummary[]

describe('creator operation target isolation', () => {
  it('rejects the old notice after switching booths even if a stale list remains', () => {
    expect(noticeTargetsBooth(notice, '201', [notice])).toBe(true)
    expect(noticeTargetsBooth(notice, '202', [notice])).toBe(false)
    expect(noticeTargetsBooth(notice, '201', null)).toBe(false)
    expect(noticeTargetsBooth(notice, '201', [])).toBe(false)
    expect(noticeTargetsBooth({ ...notice, eventBoothId: 202 }, '202', [notice])).toBe(false)
  })
  it('does not carry another booth sale into the selected ledger, including canceled sales', () => {
    const rows = [{ id: 1, eventBoothId: 201, status: 'SOLD' }, { id: 2, eventBoothId: 202, status: 'SOLD' }, { id: 3, eventBoothId: 201, status: 'CANCELED' }] as PosSale[]
    expect(salesForBooth(rows, '201').map(row => row.id)).toEqual([1, 3])
    expect(salesForBooth(rows, '202').map(row => row.id)).toEqual([2])
    expect(salesForBooth(rows, 'unknown')).toEqual([])
    expect(salesForBooth(rows, '201', true)).toEqual(rows)
  })
  it('distinguishes the same booth name and number across editions and missing metadata', () => {
    expect(eventBoothLabel(booth(201, 101), events)).toContain('10월 행사')
    expect(eventBoothLabel(booth(202, 102), events)).toContain('11월 행사')
    expect(saleBoothLabel(999, [], events)).toContain('#999')
    expect(eventBoothLabel(booth(201, 101), [])).toContain('행사 #101')
    expect(eventDates({ startAt: '2026-10-16T23:00:00Z', endAt: '2026-10-18T09:00:00Z' } as EventSummary)).toContain('2026. 10. 17.')
  })
  it('preserves the exact public participant identity for new-product and image requests', () => {
    const target = { namespace: 'CATALOG' as const, type: 'PARTICIPANT' as const, eventId: 101, id: 801 }
    const params = new URLSearchParams(supportPath('REPORT', target).split('?')[1])
    expect(readTarget(params)).toMatchObject(target)
    expect(supportTemplate('NEW_PRODUCT').body).toContain('판매하는 행사·참가일')
    expect(supportTemplate('PRODUCT_IMAGE').body).toContain('이미지 사용 권한·출처')
    expect(supportTemplate('untrusted template')).toEqual({ title: '', body: '' })
  })
})
