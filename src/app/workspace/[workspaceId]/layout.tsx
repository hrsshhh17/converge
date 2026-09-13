import WorkspaceRealtimeHub from "../../components/WorkspaceRealtimeHub";
import MobileWorkspaceChrome from "../../components/MobileWorkspaceChrome";

export default async function WorkspaceLayout({children,params}:{children:React.ReactNode;params:Promise<{workspaceId:string}>}){
 const {workspaceId}=await params;
 return <><WorkspaceRealtimeHub key={workspaceId} workspaceId={workspaceId}/><MobileWorkspaceChrome workspaceId={workspaceId}/>{children}</>;
}
