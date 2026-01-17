import { StateGraph, Annotation } from "@langchain/langgraph";
import { invoke } from "@tauri-apps/api/core";

// Define Result Item Type
export interface SearchResultItem {
  source: 'local' | 'server' | 'web';
  content: string;
  score?: number;
  metadata?: any;
}

// Define State using Annotation (Standard in LangGraph 0.2+)
const SearchStateAnnotation = Annotation.Root({
  query: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  results: Annotation<SearchResultItem[]>({
    reducer: (x, y) => [...x, ...y],
    default: () => [],
  }),
});

// Helper to get API URL
const API_URL = "http://localhost:8080/api/v1"; // Or use config
const getAuthHeaders = () => {
  const token = localStorage.getItem("token"); // Naive token retrieval
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// 1. Local RAG Node
// 1. Define executeSearch with dynamic graph creation
// Define Thinking Process Types
export interface StepLog {
  message: string;
  subItems?: string[];
}

export interface ThinkingState {
  web: { status: 'idle' | 'running' | 'done'; logs: StepLog[] };
  server: { status: 'idle' | 'running' | 'done'; logs: StepLog[] };
  local: { status: 'idle' | 'running' | 'done'; logs: StepLog[] };
}

// 1. Local RAG Node
// 1. Define executeSearch with dynamic graph creation
export const executeSearch = async (
  query: string,
  onUpdate?: (state: Partial<ThinkingState>) => void
): Promise<SearchResultItem[]> => {

  const report = (partial: Partial<ThinkingState>) => {
    if (onUpdate) onUpdate(partial);
  };

  // Node Definitions
  const localSearch = async (state: typeof SearchStateAnnotation.State) => {
    report({ local: { status: 'running', logs: [] } });

    const logs: StepLog[] = [];

    // 1. Private Scan
    logs.push({ message: "private 문서를 확인중입니다" });
    report({ local: { status: 'running', logs: [...logs] } });
    await new Promise(resolve => setTimeout(resolve, 800));

    // 2. Dept Scan
    logs.push({ message: "내가 갖고있는 부서의 문서를 확인중입니다" });
    report({ local: { status: 'running', logs: [...logs] } });
    await new Promise(resolve => setTimeout(resolve, 800));

    // 3. Project Scan
    logs.push({ message: "내가 갖고있는 프로젝트의 문서를 확인중입니다" });
    report({ local: { status: 'running', logs: [...logs] } });
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      // Execute actual search
      const localResults: any[] = await invoke("search_local", {
        query: state.query,
        limit: 5 // Increase limit slightly to show more potential matches
      });

      console.log('🔍 [Debug] Local RAG Raw Results:', localResults);

      const results = localResults.map((r) => ({
        source: 'local' as const,
        content: r.content,
        score: r.distance,
        metadata: {
          id: r.document_id,
          title: r.title || r.summary || "Untitled Document",
          group_name: r.group_name || "Unknown",
          similarity: r.similarity || 0,
          tags: r.tags
        }
      }));

      // Report findings
      if (results.length > 0) {
        logs.push({
          message: `${results.length} 개의 관련 문서를 발견했습니다`,
          subItems: results.map(r => r.metadata.title)
        });
      } else {
        logs.push({ message: "관련된 로컬 문서를 찾지 못했습니다" });
      }

      report({ local: { status: 'done', logs: [...logs] } });
      return { results };

    } catch (e) {
      console.error("Local search failed:", e);
      report({ local: { status: 'done', logs: [...logs, { message: "로컬 검색 중 오류가 발생했습니다" }] } });
      return { results: [] };
    }
  };

  const serverSearch = async (state: typeof SearchStateAnnotation.State) => {
    report({ server: { status: 'running', logs: [] } });

    const logs: StepLog[] = [];

    // 1. Dept Scan
    logs.push({ message: "내가 소속된 부서의 문서를 확인중입니다" });
    report({ server: { status: 'running', logs: [...logs] } });
    await new Promise(resolve => setTimeout(resolve, 1500));
    logs[0].subItems = ["0 개의 문서가 확인됬습니다"];
    report({ server: { status: 'running', logs: [...logs] } });

    // 2. Project Scan
    logs.push({ message: "내가 소속된 프로젝트의 문서를 확인중입니다" });
    report({ server: { status: 'running', logs: [...logs] } });
    await new Promise(resolve => setTimeout(resolve, 1500));
    logs[1].subItems = ["0 개의 문서가 확인됬습니다"]; // Mock for now
    report({ server: { status: 'running', logs: [...logs] } });

    try {
      const serverResults: any[] = await invoke("search_server", {
        query: state.query,
        limit: 3
      });

      const results = serverResults.map((r) => ({
        source: 'server' as const,
        content: r.content, // Snippet/Summary
        score: r.distance,
        metadata: {
          id: r.document_id,
          title: r.title || r.summary || "Untitled",
          group_name: r.group_name || "Server",
          similarity: r.similarity || 0,
          tags: r.tags ? r.tags.join(", ") : ""
        }
      }));

      // Report findings
      if (results.length > 0) {
        logs.push({
          message: `${results.length} 개의 관련 문서를 서버에서 발견했습니다`,
          subItems: results.map(r => r.metadata.title)
        });
      } else {
        logs.push({ message: "관련된 문서를 서버에서 찾지 못했습니다" });
      }

      report({ server: { status: 'done', logs: [...logs] } });
      return { results };
    } catch (e) {
      console.error("Server search failed:", e);
      report({
        server: {
          status: 'done',
          logs: [...logs, { message: "서버 검색 중 오류가 발생했습니다" }]
        }
      });
      return { results: [] };
    }
  };

  const webSearch = async (state: typeof SearchStateAnnotation.State) => {
    report({ web: { status: 'running', logs: [] } });

    const logs: StepLog[] = [{ message: "duckduckgo.com 에서 검색결과를 확인중입니다" }];
    report({ web: { status: 'running', logs: [...logs] } });

    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const webResults: any[] = await invoke("search_web", {
        query: state.query
      });

      const results = webResults.map((r) => ({
        source: 'web' as const,
        content: r.content || r.summary || "No content",
        score: r.distance || 0.5,
        metadata: {
          url: r.document_id,
          title: r.title || r.summary,
          group_name: r.group_name || "Web",
          similarity: r.similarity || 100.0
        }
      }));

      // Update logs with findings
      if (results.length > 0) {
        logs[0].subItems = results.slice(0, 3).map(r => r.metadata.title || "Untitled Result");
        logs[0].subItems.push(`${results.length} 개의 문서가 확인됬습니다`);
      } else {
        logs[0].subItems = ["검색 결과가 없습니다"];
      }
      report({ web: { status: 'running', logs: [...logs] } });
      await new Promise(resolve => setTimeout(resolve, 200));

      if (results.length === 0) {
        report({ web: { status: 'done', logs: [...logs] } });
        return {
          results: [{
            source: 'web' as const,
            content: "검색 결과가 없습니다",
            score: 0,
            metadata: {}
          }]
        };
      }

      report({ web: { status: 'done', logs: [...logs] } });
      return { results };
    } catch (e) {
      console.error("Web search failed:", e);
      report({ web: { status: 'done', logs: [...logs] } });
      return { results: [] };
    }
  };

  // Define Sequential Graph
  const builder = new StateGraph(SearchStateAnnotation)
    .addNode("local", localSearch)
    .addNode("server", serverSearch)
    .addNode("web", webSearch)
    .addEdge("__start__", "local")
    .addEdge("local", "server")
    .addEdge("server", "web")
    .addEdge("web", "__end__");

  const graph = builder.compile();
  const result = await graph.invoke({ query });
  return result.results;
};
