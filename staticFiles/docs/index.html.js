export const render = (data) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${data.project.name} Docs</title>

  <link rel="stylesheet" href="reset.css" media="screen" title="Main Stylesheet" charset="utf-8">
  <link rel="stylesheet" href="style.css" media="screen" title="Main Stylesheet" charset="utf-8">
</head>
<body>
<div class="wrapper">
  <!-- include sidebar -->
  <aside class="sidebar">
    <h1>Documentation
      <small>Beta</small>
    </h1>

    <ul class="actionsList">
      ${data.actions.map((action) => `<li><a href="./action_${action}.html">${action}</a></li>`).join("")}
    </ul>
  </aside>

  <!-- main content -->
  <div class="main">
    <!-- project name -->
    <div class="project-title">
      <h1>Project: ${data.project.name}</h1>
      <h2>v${data.project.version}</h2>
    </div>

    <!-- project description -->
    <div class="panel">
      <div class="panel-header">Project Description</div>
      <div class="panel-block">${data.project.description || ""}</div>
    </div>

    <!-- available tasks -->
    <div class="panel">
      <div class="panel-header">Available Tasks</div>
      <div class="panel-block">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Frequency (ms)</th>
            </tr>
          </thead>
          <tbody>
            ${
	data.tasks.map(
		(task) => `
            <tr>
              <td>${task.name}</td>
              <td>${task.description}</td>
              <td>${task.frequency}</td>
            </tr>
            `,
	)
}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>

</body>
</html>
`;
