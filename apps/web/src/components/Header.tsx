import Link from 'next/link';

const Header = () => {
  return (
    <header className="bg-gray-800 text-white p-4">
      <div className="container mx-auto flex justify-between">
        <Link href="/" className="text-xl font-bold">
          Unified AI Toolbox
        </Link>
        <div>
          <Link href="/prompts" className="mr-4">
            Prompts
          </Link>
          <Link href="/agents" className="mr-4">
            Agents
          </Link>
          <Link href="/orchestration" className="mr-4">
            Orchestration
          </Link>
          <Link href="/code-review">
            Code Review
          </Link>
        </div>
      </div>
    </header>
  );
};

export default Header;
