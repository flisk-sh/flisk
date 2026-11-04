function Injectable(): ClassDecorator { return () => {}; }
function Inject(t?: any): ParameterDecorator { return () => {}; }
function Prop(): PropertyDecorator { return () => {}; }
function Get(p: string): MethodDecorator { return () => {}; }
class Repo { find(): string[] { return []; } }
@Injectable()
export class Service {
  @Prop() name: string;
  @Prop() repo: Repo;
  constructor(@Inject() private readonly r: Repo, public n: number) {}
  @Get("/x") list(a: string, b?: Repo): Promise<string[]> { return Promise.resolve(this.r.find()); }
}
const bad: number = "decorators";
