from typing import List, Dict, Any
import asyncio

class OrchestratorService:
    """Manages the DAG task execution and coordinates agent teams."""
    
    def __init__(self, project_id: str):
        self.project_id = project_id
        # In memory graph for now
        self.graph = {}
        
    async def run_plan(self, plan: List[Dict[str, Any]]):
        """Executes a list of tasks in parallel where dependencies allow."""
        
        pending = list(plan)
        completed = set()
        
        while pending:
            # Find tasks with no pending dependencies
            ready_tasks = [t for t in pending if all(d in completed for d in t.get("dependencies", []))]
            
            if not ready_tasks:
                break # Circular dependency or error
                
            # Execute them in parallel
            tasks = [self._execute_node(node) for node in ready_tasks]
            await asyncio.gather(*tasks)
            
            for node in ready_tasks:
                completed.add(node["id"])
                pending.remove(node)
                
    async def _execute_node(self, node: Dict[str, Any]):
        """Runs an individual node, e.g. calling an LLM or file parser."""
        print(f"[{node.get('role', 'System')}] Executing task: {node['name']}")
        
        # Here we would send WebSocket broadcasts to PixiJS Agent Town
        # sim_ws.broadcast(state="running", agent=node['role'])
        
        await asyncio.sleep(1) # Fake delay
        
        # sim_ws.broadcast(state="success")
        return {"status": "success", "artifact": f"Result of {node['name']}"}
