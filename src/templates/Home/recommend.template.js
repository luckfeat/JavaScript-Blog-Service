const template = `
      <h1>Recommended Articles <span>AI</span></h1>
      <a class="prev" href="javascript:void(0);">이전</a>
      <ul class="recommend">
          {{#each this}}
              <a href="#/article?category=ai&title={{this.title}}">
                <li>{{this.title}}</li>
                <p>{{this.description}}</p>
                <img width="200" height="200" src="{{this.image}}" alt="{{this.title}}">
                <p>{{this.source.name}}</p>
              </a>
          {{/each}}
     </ul>
     <a class="next" href="javascript:void(0);">이후</a>
`;

export default window.Handlebars.compile(template);
