'use client'

import type { TaskType, MatchingPairsData, SortingOrderData } from '@/lib/tasks.types'
import { Link2, ArrowUpDown, PenLine, Tag, Brush, Mic } from 'lucide-react'
import MatchingPairsEditor from './editors/MatchingPairsEditor'
import SortingOrderEditor from './editors/SortingOrderEditor'

export interface TaskForm {
  id: string
  task_type: TaskType
  title_ar: string
  title_en: string
  instruction_ar: string
  instruction_en: string
  timestamp_seconds: number
  task_data: Record<string, unknown>
  timeout_seconds: number | null
  is_skippable: boolean
  points: number
}

import type { LucideIcon } from 'lucide-react'

const TASK_TYPE_META: Record<string, { icon: LucideIcon; label: string }> = {
  matching_pairs: { icon: Link2, label: 'Matching Pairs' },
  sorting_order: { icon: ArrowUpDown, label: 'Sorting Order' },
  fill_in_blank_enhanced: { icon: PenLine, label: 'Fill in Blank' },
  drag_drop_label: { icon: Tag, label: 'Drag & Drop Labels' },
  drawing_tracing: { icon: Brush, label: 'Drawing / Tracing' },
  audio_recording: { icon: Mic, label: 'Audio Recording' },
}

function TaskTypeLabel({ type }: { type: string }) {
  const meta = TASK_TYPE_META[type]
  if (!meta) return <>{type}</>
  const Icon = meta.icon
  return <><Icon className="inline w-3.5 h-3.5" /> {meta.label}</>
}

const SUPPORTED_TYPES: TaskType[] = ['matching_pairs', 'sorting_order']

function getDefaultTaskData(taskType: TaskType): Record<string, unknown> {
  switch (taskType) {
    case 'matching_pairs':
      return {
        pairs: [
          { id: crypto.randomUUID(), left_ar: '', left_en: '', right_ar: '', right_en: '' },
          { id: crypto.randomUUID(), left_ar: '', left_en: '', right_ar: '', right_en: '' },
        ],
        shuffle_right: true,
      } satisfies MatchingPairsData as unknown as Record<string, unknown>
    case 'sorting_order':
      return {
        items: [
          { id: crypto.randomUUID(), text_ar: '', text_en: '', correct_position: 0 },
          { id: crypto.randomUUID(), text_ar: '', text_en: '', correct_position: 1 },
        ],
        instruction_type: 'custom',
      } satisfies SortingOrderData as unknown as Record<string, unknown>
    default:
      return {}
  }
}

interface Props {
  tasks: TaskForm[]
  onChange: (tasks: TaskForm[]) => void
  onSave: () => void
  saving: boolean
  hideSaveButton?: boolean
}

export default function TaskEditor({ tasks, onChange, onSave, saving, hideSaveButton }: Props) {
  const updateTask = (taskId: string, updates: Partial<TaskForm>) => {
    onChange(tasks.map(t => t.id === taskId ? { ...t, ...updates } : t))
  }

  const addTask = (taskType: TaskType) => {
    onChange([
      ...tasks,
      {
        id: crypto.randomUUID(),
        task_type: taskType,
        title_ar: '',
        title_en: '',
        instruction_ar: '',
        instruction_en: '',
        timestamp_seconds: 0,
        task_data: getDefaultTaskData(taskType),
        timeout_seconds: null,
        is_skippable: true,
        points: 10,
      },
    ])
  }

  const removeTask = (taskId: string) => {
    onChange(tasks.filter(t => t.id !== taskId))
  }

  const renderTaskDataEditor = (task: TaskForm) => {
    switch (task.task_type) {
      case 'matching_pairs':
        return (
          <MatchingPairsEditor
            data={task.task_data as unknown as MatchingPairsData}
            onChange={(data) => updateTask(task.id, { task_data: data as unknown as Record<string, unknown> })}
          />
        )
      case 'sorting_order':
        return (
          <SortingOrderEditor
            data={task.task_data as unknown as SortingOrderData}
            onChange={(data) => updateTask(task.id, { task_data: data as unknown as Record<string, unknown> })}
          />
        )
      default:
        return (
          <p className="text-sm text-gray-400 italic">
            Editor for {task.task_type} coming soon.
          </p>
        )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Interactive Tasks</h2>
        <div className="flex gap-2">
          {SUPPORTED_TYPES.map(type => (
            <button
              key={type}
              onClick={() => addTask(type)}
              className="px-3 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors"
            >
              + <TaskTypeLabel type={type} />
            </button>
          ))}
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-gray-500">No tasks yet. Add interactive tasks that appear during the video.</p>
      ) : (
        <div className="space-y-4">
          {tasks.map((task, index) => (
            <div key={task.id} className="border border-amber-200 bg-amber-50/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold">
                    <TaskTypeLabel type={task.task_type} />
                  </span>
                  <span className="text-sm font-semibold text-gray-700">Task {index + 1}</span>
                </div>
                <button
                  onClick={() => removeTask(task.id)}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </div>

              {/* Title & Instruction */}
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Title (Arabic)</label>
                  <input
                    value={task.title_ar}
                    onChange={(e) => updateTask(task.id, { title_ar: e.target.value })}
                    placeholder="عنوان المهمة"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Title (English)</label>
                  <input
                    value={task.title_en}
                    onChange={(e) => updateTask(task.id, { title_en: e.target.value })}
                    placeholder="Task title"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Instruction (Arabic)</label>
                  <input
                    value={task.instruction_ar}
                    onChange={(e) => updateTask(task.id, { instruction_ar: e.target.value })}
                    placeholder="وصّل كل عنصر بما يناسبه"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Instruction (English)</label>
                  <input
                    value={task.instruction_en}
                    onChange={(e) => updateTask(task.id, { instruction_en: e.target.value })}
                    placeholder="Match each item with its pair"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              {/* Settings row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Timestamp (sec)</label>
                  <input
                    type="number"
                    value={task.timestamp_seconds}
                    onChange={(e) => updateTask(task.id, { timestamp_seconds: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Points</label>
                  <input
                    type="number"
                    value={task.points}
                    onChange={(e) => updateTask(task.id, { points: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Timeout (sec)</label>
                  <input
                    type="number"
                    value={task.timeout_seconds ?? ''}
                    onChange={(e) => updateTask(task.id, {
                      timeout_seconds: e.target.value ? Number(e.target.value) : null
                    })}
                    placeholder="No limit"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={task.is_skippable}
                      onChange={(e) => updateTask(task.id, { is_skippable: e.target.checked })}
                    />
                    Skippable
                  </label>
                </div>
              </div>

              {/* Task-specific data editor */}
              <div className="border-t border-amber-200 pt-3">
                {renderTaskDataEditor(task)}
              </div>
            </div>
          ))}
        </div>
      )}

      {tasks.length > 0 && !hideSaveButton && (
        <div className="flex justify-end">
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Tasks'}
          </button>
        </div>
      )}
    </div>
  )
}

export { getDefaultTaskData }
