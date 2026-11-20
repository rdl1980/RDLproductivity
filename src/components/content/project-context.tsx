"use client";

import { createContext, useContext } from "react";

import { type ContentProjectConfig, PROJECTS } from "@/lib/content";

const ProjectContext = createContext<ContentProjectConfig>(PROJECTS.robotti);

/** The calendar being shown: its platforms, slots, paths and labels. */
export const ContentProjectProvider = ProjectContext.Provider;

export function useContentProject(): ContentProjectConfig {
  return useContext(ProjectContext);
}
