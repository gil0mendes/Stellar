function renderMenuItems(actions) {
	return actions.map((action) => `<li><a href="./action_${action}.html">${action}</a></li>`).join("");
}

function renderInputs(inputs) {
	return `<table class="table">
  <thead>
  <tr>
    <th>Field Name</th>
    <th>Description</th>
    <th>Default</th>
    <th>Validator</th>
  </tr>
  </thead>

  <tbody>
  ${
		inputs
			.map(
				(input) => `
  <tr>
    <td>${input.name}</td>
    <td>${input.description}</td>
    <td>${input.default}</td>
    <td>
      <ul class="validators">
        ${
					input.validators
						? input.validators.map((validator) => `<li class="${validator.type}">${validator.value}</li>`).join("")
						: ""
				}
      </ul>
    </td>
  </tr>`,
			)
			.join("")
	}
  </tbody>
</table>`;
}

function renderActionVersion(action) {
	return `
  <h3 class="action-version">Version: ${action.version}</h3>

  <!-- action description -->
  <div class="panel">
    <div class="panel-header">Description</div>
    <div class="panel-block">
      <p>${action.description}</p>
    </div>
  </div>

  <div class="panel">
    <div class="panel-header">Inputs</div>

    <div class="panel-block">
      ${action.inputs ? renderInputs(action.inputs) : "<p>No inputs!</p>"}
    </div>
  </div>

  ${
		action.outputExample
			? `
  <div class="panel">
    <div class="panel-header">
      Output Example
    </div>

    <div class="panel-block">
      <pre>
        <code class="json">${action.outputExample}</code>
      </pre>
    </div>
  </div>`
			: ""
	}
  `;
}

export const render = (data) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Docs > ${data.actionName}</title>

  <link rel="stylesheet" href="reset.css" media="screen" title="Main Stylesheet" charset="utf-8">
  <link rel="stylesheet" href="style.css" media="screen" title="Main Stylesheet" charset="utf-8">
</head>
<body>
<div class="wrapper">
  <!-- include sidebar -->
  <aside class="sidebar">
    <h1>
      <a href="./index.html">Documentation</a>
      <small>Beta</small>
    </h1>

    <ul class="actionsList">
      ${renderMenuItems(data.actions)}
    </ul>
  </aside>

  <div class="main">
    <h1 class="action-title">${data.actionName}</h1>

    ${data.actionVersions.map((action) => renderActionVersion(action)).join("")}
  </div>
</div>

<!-- load highlight -->
<script src="highlight.js" charset="utf-8"></script>

<!-- startup code -->
<script type="text/javascript">
  // start the highlight.js
  hljs.initHighlightingOnLoad()

  // set the selected action active
  const sidebar = document.querySelector('.actionsList')
  const parts = window.location.href.split('/')
  const lastPart = parts[parts.length - 1]
  const curPage = lastPart.substr(7, lastPart.length - 12)
  const nodes = document.querySelector('.actionsList').getElementsByTagName('li')

  for (let index = 0; index < nodes.length-1; index++) {
    const item = nodes[index]

    if (item.children[0].innerText === curPage) {
      // scroll sidebar to the item location
      sidebar.scrollTop = item.offsetTop - 50

      // append active class
      item.className += 'active'
      break
    }
  }
</script>

</body>
</html>
`;
