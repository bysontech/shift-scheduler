/// <reference lib="webworker" />

export type SolverStaff = { id: string; name: string }

export type SolverInput = {
  staff: SolverStaff[]
  year: number
  month: number
}

export type EntryOutput = {
  staff_id: string
  date: string
  task_type: string
}

export type SolverOutput = {
  status: 'success' | 'partial'
  entries: EntryOutput[]
  unfilledSlots: string[]
}

const TASK_NIGHT = '当直'
const TASK_POST_NIGHT = '明休'
const TASK_DAY = '日勤'

self.onmessage = (e: MessageEvent<SolverInput>) => {
  const { staff, year, month } = e.data

  if (staff.length === 0) {
    self.postMessage({ status: 'partial', entries: [], unfilledSlots: [] } satisfies SolverOutput)
    return
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  const entries: EntryOutput[] = []
  const unfilledSlots: string[] = []

  // lastTask[staffId] = task assigned on previous day
  const lastTask = new Map<string, string>()
  let nightDutyIndex = 0

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    for (const member of staff) {
      const prev = lastTask.get(member.id)

      let task: string
      if (prev === TASK_NIGHT) {
        // 当直の翌日は必ず明休
        task = TASK_POST_NIGHT
      } else {
        // Rotate night duty: one staff member per day
        const nightStaff = staff[nightDutyIndex % staff.length]
        if (member.id === nightStaff.id) {
          task = TASK_NIGHT
        } else {
          task = TASK_DAY
        }
      }

      lastTask.set(member.id, task)
      entries.push({ staff_id: member.id, date, task_type: task })
    }

    // Advance night duty rotation (skip staff who just came off 明休)
    nightDutyIndex++
  }

  const output: SolverOutput = {
    status: 'success',
    entries,
    unfilledSlots,
  }

  self.postMessage(output)
}
