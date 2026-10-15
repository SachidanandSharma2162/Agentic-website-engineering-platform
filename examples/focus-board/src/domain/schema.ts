import { z } from "zod";
import { isDayKey } from "./dates.ts";

export const LIMITS = {
  titleMax: 120,
  habitNameMax: 60,
  maxTasks: 5000,
  maxHabits: 200,
  maxCheckIns: 3700,
  maxImportBytes: 1_000_000,
} as const;

export const Priority = z.enum(["high", "normal", "low"]);
export type Priority = z.infer<typeof Priority>;

const dayKey = z.string().refine(isDayKey, "not a calendar date");

export const TaskSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(LIMITS.titleMax),
  priority: Priority,
  done: z.boolean(),
  today: z.boolean(),
  createdAt: z.string().max(40),
});
export type Task = z.infer<typeof TaskSchema>;

export const HabitSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(LIMITS.habitNameMax),
  checkIns: z.array(dayKey).max(LIMITS.maxCheckIns),
});
export type Habit = z.infer<typeof HabitSchema>;

export const AppDataSchema = z.object({
  version: z.literal(1),
  tasks: z.array(TaskSchema).max(LIMITS.maxTasks),
  habits: z.array(HabitSchema).max(LIMITS.maxHabits),
});
export type AppData = z.infer<typeof AppDataSchema>;

export const emptyData = (): AppData => ({ version: 1, tasks: [], habits: [] });
