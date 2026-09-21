export const View = (props: { ready: boolean }) => (
  <section>{props.ready ? <span>ready</span> : <span>waiting</span>}</section>
)
